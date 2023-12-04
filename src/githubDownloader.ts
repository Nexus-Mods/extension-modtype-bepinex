/* eslint-disable */
import * as https from 'https';
import * as _ from 'lodash';
import * as semver from 'semver';
import * as url from 'url';

import { IBepInExGameConfig, IGithubRelease } from './types';

import { raiseConsentDialog } from './bepInExDownloader';

import { IncomingHttpHeaders, IncomingMessage } from 'http';
import { actions, log, selectors, types, util } from 'vortex-api';
import { generateRegexp } from './common';

const GITHUB_URL = 'https://api.github.com/repos/BepInEx/BepInEx';
const BIX_LANDING = 'https://github.com/BepInEx/BepInEx';

function query(baseUrl: string, request: string): Promise<IGithubRelease[]> {
  return new Promise((resolve, reject) => {
    const getRequest = getRequestOptions(`${baseUrl}/${request}`);
    https.get(getRequest, (res: IncomingMessage) => {
      res.setEncoding('utf-8');
      const msgHeaders: IncomingHttpHeaders = res.headers;
      const callsRemaining = parseInt(util.getSafe(msgHeaders, ['x-ratelimit-remaining'], '0'), 10);
      if ((res.statusCode === 403) && (callsRemaining === 0)) {
        const resetDate = parseInt(util.getSafe(msgHeaders, ['x-ratelimit-reset'], '0'), 10);
        log('info', 'GitHub rate limit exceeded',
          { reset_at: (new Date(resetDate)).toString() });
        return reject(new util.ProcessCanceled('GitHub rate limit exceeded'));
      }

      let output: string = '';
      res
        .on('data', data => output += data)
        .on('end', () => {
          try {
            return resolve(JSON.parse(output));
          } catch (parseErr) {
            return reject(parseErr);
          }
        });
    })
      .on('error', err => {
        return reject(err);
      })
      .end();
  });
}

function getRequestOptions(link: string) {
  const relUrl = url.parse(link);
  return ({
    ..._.pick(relUrl, ['port', 'hostname', 'path']),
    headers: {
      'User-Agent': 'Vortex',
    },
  });
}

async function downloadConsent(api: types.IExtensionApi,
                               gameConf: IBepInExGameConfig): Promise<void> {
  return raiseConsentDialog(api, gameConf)
    .then(result => (result.action === 'Close')
      ? Promise.reject(new util.UserCanceled())
      : Promise.resolve());
}

async function notifyUpdate(api: types.IExtensionApi,
                            latest: string,
                            current: string): Promise<void> {
  const t = api.translate;
  return new Promise((resolve, reject) => {
    api.sendNotification({
      type: 'info',
      id: `bix-update`,
      noDismiss: true,
      allowSuppress: true,
      title: 'Update for {{name}}',
      message: 'Latest: {{latest}}, Installed: {{current}}',
      replace: {
        latest,
        current,
      },
      actions: [
        {
          title: 'More', action: (dismiss: () => void) => {
            api.showDialog('info', '{{name}} Update', {
              text: 'Vortex has detected a newer version of {{name}} ({{latest}}) available to download from {{website}}. You currently have version {{current}} installed.'
                + '\nVortex can download and attempt to install the new update for you.',
              parameters: {
                name: 'BepInEx',
                website: BIX_LANDING,
                latest,
                current,
              },
            }, [
              {
                label: 'Download',
                action: () => {
                  resolve();
                  dismiss();
                },
              },
            ]);
          },
        },
        {
          title: 'Dismiss',
          action: (dismiss) => {
            resolve();
            dismiss();
          },
        },
      ],
    });
  });
}

export async function getLatestReleases(currentVersion: string): Promise<IGithubRelease[]> {
  if (GITHUB_URL) {
    return query(GITHUB_URL, 'releases')
      .then((releases) => {
        if (!Array.isArray(releases)) {
          return Promise.reject(new util.DataInvalid('expected array of github releases'));
        }
        const current = releases
          .filter(rel => {
            const tagName = util.getSafe(rel, ['tag_name'], '5.4.22');
            const version = semver.valid(tagName);

            return (version !== null)
              && ((currentVersion === undefined) || (semver.gte(version, currentVersion)));
          })
          .sort((lhs, rhs) => semver.compare(rhs.tag_name, lhs.tag_name));
        return Promise.resolve(current);
      });
  }
}

async function startDownload(api: types.IExtensionApi,
                             gameConf: IBepInExGameConfig,
                             downloadVer: string,
                             downloadLink: string) {
  const { gameId } = gameConf;
  // tslint:disable-next-line: no-shadowed-variable - why is this even required ?
  const redirectionURL = await new Promise((resolve, reject) => {
    https.request(getRequestOptions(downloadLink), res => {
      return resolve(res.headers['location']);
    })
      .on('error', err => reject(err))
      .end();
  });
  const dlInfo = {
    game: gameId,
    name: 'BepInEx',
  };
  api.events.emit('start-download', [redirectionURL], dlInfo, undefined,
    (error, id) => {
      if (error !== null) {
        if ((error.name === 'AlreadyDownloaded')
          && (error.downloadId !== undefined)) {
          id = error.downloadId;
        } else {
          api.showErrorNotification('Download failed',
            error, { allowReport: false });
          return Promise.resolve();
        }
      }
      api.events.emit('start-install-download', id, true, (err, modId) => {
        if (err !== null) {
          api.showErrorNotification('Failed to install BepInEx',
            err, { allowReport: false });
        }

        const state = api.getState();
        const profileId = selectors.lastActiveProfileForGame(state, gameId);
        const batched = [
          actions.setModEnabled(profileId, modId, true),
          actions.setModAttribute(gameId, modId, 'source', 'other'),
          actions.setModAttribute(gameId, modId, 'url', redirectionURL),
          actions.setModAttribute(gameId, modId, 'version', downloadVer),
        ];
        util.batchDispatch(api.store, batched);
        return Promise.resolve();
      });
    }, 'ask');
}

async function resolveDownloadLink(gameConf: IBepInExGameConfig, currentReleases: any[]) {
  const rgx = generateRegexp(gameConf);
  let assetLink: string | undefined;
  const matchingRelease = currentReleases.find((release, idx) => {
    if (gameConf.bepinexVersion === undefined && idx === 0) {
      return true;
    } else if (gameConf.bepinexVersion !== undefined) {
      const tagVer = release.tag_name.slice(1);
      if (tagVer !== gameConf.bepinexVersion) {
        return false;
      } else {
        const matches = release.assets.filter(asset => rgx.test(asset.name));
        if (matches.length > 0) {
          assetLink = matches[0].browser_download_url;
          return true;
        }
      }
    } else {
      return false;
    }
  });
  if (matchingRelease === undefined) {
    return Promise.reject(new util.DataInvalid('Failed to find matching BepInEx archive'));
  }
  const downloadLink = assetLink || matchingRelease.assets[0].browser_download_url;
  return (downloadLink === undefined)
    ? Promise.reject(new util.DataInvalid('Failed to resolve browser download url'))
    : Promise.resolve({ version: matchingRelease.tag_name.slice(1), downloadLink });
}

export async function checkForUpdates(api: types.IExtensionApi,
                                      gameConf: IBepInExGameConfig,
                                      currentVersion: string): Promise<string> {
  return getLatestReleases(currentVersion)
    .then(async currentReleases => {
      if (currentReleases[0] === undefined) {
        // We failed to check for updates - that's unfortunate but shouldn't
        //  be reported to the user as it will just confuse them.
        log('error', 'Unable to update BepInEx', 'Failed to find any releases');
        return Promise.resolve(currentVersion);
      }
      const { version, downloadLink } = await resolveDownloadLink(gameConf, currentReleases);
      if (semver.valid(version) === null) {
        return Promise.resolve(currentVersion);
      } else {
        if (semver.gt(version, currentVersion)) {
          return notifyUpdate(api, version, currentVersion)
            .then(() => startDownload(api, gameConf, version, downloadLink))
            .then(() => Promise.resolve(version));
        } else {
          return Promise.resolve(currentVersion);
        }
      }
    }).catch(err => {
      if (err instanceof util.UserCanceled || err instanceof util.ProcessCanceled) {
        return Promise.resolve(currentVersion);
      }

      api.showErrorNotification('Unable to update BepInEx', err);
      return Promise.resolve(currentVersion);
    });
}

export async function downloadFromGithub(api: types.IExtensionApi,
                                         gameConf: IBepInExGameConfig): Promise<void> {
  return getLatestReleases(undefined)
    .then(async currentReleases => {
      const { version, downloadLink } = await resolveDownloadLink(gameConf, currentReleases);
      return downloadConsent(api, gameConf)
        .then(() => startDownload(api, gameConf, version, downloadLink));
    })
    .catch(err => {
      if (err instanceof util.UserCanceled || err instanceof util.ProcessCanceled) {
        return Promise.resolve();
      } else {
        api.showErrorNotification('Unable to download/install BepInEx', err);
        return Promise.resolve();
      }
    });
}
