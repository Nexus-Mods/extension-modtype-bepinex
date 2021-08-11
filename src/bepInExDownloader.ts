import path from 'path';
import { actions, fs, log, selectors, types, util } from 'vortex-api';

import { getDownload, getSupportMap, NEXUS } from './common';
import { IBepInExGameConfig, INexusDownloadInfo, INexusDownloadInfoExt, NotPremiumError } from './types';

function genDownloadProps(api: types.IExtensionApi, archiveName: string) {
  const state = api.getState();
  const downloads: { [dlId: string]: types.IDownload } = util.getSafe(state, ['persistent', 'downloads', 'files'], {});
  const downloadId = Object.keys(downloads).find(dId => downloads[dId].localPath === archiveName);
  return { downloads, downloadId, state };
}

function updateSupportedGames(api: types.IExtensionApi, downloadInfo: INexusDownloadInfo) {
  const { downloadId, downloads } = genDownloadProps(api, downloadInfo.archiveName);
  if (downloadId === undefined) {
    throw new util.NotFound(`bepinex download is missing: ${downloadInfo.archiveName}`);
  }

  const currentlySupported = downloads[downloadId].game;
  const supportedGames = new Set<string>(currentlySupported.concat(Object.keys(getSupportMap())));
  api.store.dispatch(actions.setCompatibleGames(downloadId, Array.from(supportedGames)));
}

async function install(api: types.IExtensionApi,
                       downloadInfo: INexusDownloadInfo,
                       downloadId: string,
                       force?: boolean) {
  const state = api.getState();
  if (downloadInfo.allowAutoInstall && state.settings.automation?.['install'] !== true) {
    const mods: { [modId: string]: types.IMod } =
      util.getSafe(state, ['persistent', 'mods', downloadInfo.gameId], {});
    const isInjectorInstalled = (force) ? false : Object.keys(mods).find(id =>
      mods[id].type === 'bepinex-injector') !== undefined;
    if (!isInjectorInstalled) {
      return new Promise<string>((resolve, reject) => {
        api.events.emit('start-install-download', downloadId, true, (err, modId) => {
          return (err) ? reject(err) : resolve(modId);
        });
      });
    } else {
      return Promise.resolve();
    }
  }
}

async function download(api: types.IExtensionApi,
                        downloadInfo: INexusDownloadInfo, force?: boolean) {
  const { domainId, modId, fileId, archiveName, allowAutoInstall } = downloadInfo;
  const state = api.getState();
  if (!util.getSafe(state, ['persistent', 'nexus', 'userInfo', 'isPremium'], false)) {
    return Promise.reject(new NotPremiumError());
  }

  const downloadId = genDownloadProps(api, archiveName).downloadId;
  if (downloadId !== undefined) {
    try {
      updateSupportedGames(api, downloadInfo);
      return install(api, downloadInfo, downloadId, force);
    } catch (err) {
      return Promise.reject(err);
    }
  }

  return api.emitAndAwait('nexus-download',
    domainId, modId, fileId, archiveName, allowAutoInstall)
    .then(() => {
      const { downloadId } = genDownloadProps(api, downloadInfo.archiveName);
      try {
        updateSupportedGames(api, downloadInfo);
        return install(api, downloadInfo, downloadId, force);
      } catch (err) {
        return Promise.reject(err);
      }
    })
    .catch(err => {
      log('error', 'failed to download from NexusMods.com',
        JSON.stringify(downloadInfo, undefined, 2));
      err['attachLogOnReport'] = true;
      api.showErrorNotification('Failed to download BepInEx dependency', err);
    });
}

export async function ensureBepInExPack(api: types.IExtensionApi,
                                        gameMode?: string, force?: boolean) {
  const state = api.getState();
  const gameId = (gameMode === undefined)
    ? selectors.activeGameId(state)
    : gameMode;
  const gameConf: IBepInExGameConfig = getSupportMap()[gameId];
  if (gameConf === undefined || !gameConf.autoDownloadBepInEx) {
    return;
  }

  const mods: { [modId: string]: types.IMod } =
    util.getSafe(state, ['persistent', 'mods', gameId], {});

  if (gameConf.bepinexVersion !== undefined) {
    const dl = getDownload(gameConf);
    const injectorModIds = Object.keys(mods).filter(id => mods[id]?.type === 'bepinex-injector');
    const hasRequiredVersion = injectorModIds.reduce((prev, iter) => {
      if (mods[iter]?.attributes?.fileId === +dl.fileId) {
        prev = true;
      }
      return prev;
    }, false);
    if (!hasRequiredVersion) {
      force = true;
    }
  }

  const isInjectorInstalled = (!force)
    ? Object.keys(mods).find(id => mods[id].type === 'bepinex-injector') !== undefined
    : false;

  if (isInjectorInstalled) {
    // We have a mod installed with the injector modType, do nothing.
    return;
  }

  let downloadRes;
  if (gameConf.customPackDownloader !== undefined) {
    try {
      downloadRes = await gameConf.customPackDownloader(util.getVortexPath('temp'));
      if (downloadRes as INexusDownloadInfo !== undefined) {
        await download(api, (downloadRes as INexusDownloadInfo), force);
      } else if (typeof(downloadRes) === 'string') {
        if (!path.isAbsolute(downloadRes)) {
          log('error', 'failed to download custom pack', 'expected absolute path');
        }
        const downloadsPath = selectors.downloadPathForGame(state, gameId);
        await fs.copyAsync(downloadRes, path.join(downloadsPath, path.basename(downloadRes)));
      } else {
        // tha f*ck is dis?
        log('error', 'failed to download custom pack', { downloadRes });
        return;
      }
    } catch (err) {
      if (err instanceof NotPremiumError) {
        const downloadInfo = downloadRes as INexusDownloadInfo;
        const url = path.join(NEXUS, downloadInfo.domainId, 'mods', downloadInfo.modId)
          + `?tab=files&file_id=${downloadRes.fileId}&nmm=1`;
        util.opn(url)
          .catch(err2 => api.showErrorNotification('Failed to download custom pack', err2,
            { allowReport: false }));
      }
      log('error', 'failed to download custom pack', err);
      return;
    }
  } else {
    const defaultDownload = getDownload(gameConf);
    try {
      await download(api, defaultDownload, force);
    } catch (err) {
      if (err instanceof NotPremiumError) {
        const t = api.translate;
        const replace = {
          game: gameMode,
          bl: '[br][/br][br][/br]',
        };
        api.showDialog('info', 'BepInEx Required', {
          bbcode: t('The {{game}} game extension requires a widely used 3rd party assembly '
          + 'patching/injection library called Bepis Injector Extensible (BepInEx).{{bl}}'
          + 'Vortex can walk you through the download/installation process; once complete, BepInEx '
          + 'will be available in your mods page to enable/disable just like any other regular mod. '
          + 'Depending on the modding pattern of {{game}}, BepInEx may be a hard requirement '
          + 'for mods to function in-game, in which case you MUST have the library enabled and deployed '
          + 'at all times for the mods to work!{{bl}}'
          + 'To remove the library, simply disable the mod entry for BepInEx.'
          , { replace }),
        }, [
          { label: 'Close' },
          {
            label: 'Download BepInEx',
            action: () => downloadFromGithub(api, defaultDownload),
            default: true,
          },
        ]);
        return Promise.reject(err);
      }
      log('error', 'failed to download default pack', err);
    }
  }
}

async function downloadFromGithub(api: types.IExtensionApi, dlInfo: INexusDownloadInfoExt) {
  const t = api.translate;
  const replace = {
    archiveName: dlInfo.archiveName,
  };
  const instructions = t('Once you allow Vortex to browse to GitHub - '
    + 'Please scroll down and click on "{{archiveName}}"', { replace });
  return new Promise((resolve, reject) => {
    api.emitAndAwait('browse-for-download', dlInfo.githubUrl, instructions)
      .then((result: string[]) => {
        if (!result || !result.length) {
          // If the user clicks outside the window without downloading.
          return reject(new util.UserCanceled());
        }
        if (!result[0].includes(dlInfo.archiveName)) {
          return reject(new util.ProcessCanceled('Selected wrong download'));
        }
        api.events.emit('start-download', [result[0]], {}, undefined,
          (error, id) => {
            if (error !== null) {
              return reject(error);
            }
            api.events.emit('start-install-download', id, true, (err, modId) => {
              if (err) {
                // Error notification gets reported by the event listener
                log('error', 'Error installing download', err);
              }
              return resolve(undefined);
            });
          }, 'never');
      });
  })
  .catch(err => {
    if (err instanceof util.UserCanceled) {
      return Promise.resolve();
    } else {
      return downloadFromGithub(api, dlInfo);
    }
  });
}
