import path from 'path';
import { actions, fs, log, selectors, types, util } from 'vortex-api';

import { getSupportMap } from './common';
import { IBepInExGameConfig, INexusDownloadInfo } from './types';

async function download(api: types.IExtensionApi, downloadInfo: INexusDownloadInfo) {
  const { domainId, modId, fileId, archiveName, allowAutoInstall } = downloadInfo;
  const genDownloadProps = () => {
    const state = api.getState();
    const downloads: { [dlId: string]: types.IDownload } = util.getSafe(state, ['persistent', 'downloads', 'files'], {});
    const downloadId = Object.keys(downloads).find(dId => downloads[dId].localPath === archiveName);
    return { downloads, downloadId, state };
  };
  if (genDownloadProps().downloadId !== undefined) {
    return;
  }
  return api.emitAndAwait('nexus-download',
    domainId, modId, fileId, archiveName, allowAutoInstall)
    .then(() => {
      const { downloadId, downloads, state } = genDownloadProps();
      if (downloadId === undefined) {
        return Promise.reject(new util.NotFound(`bepinex download is missing: ${archiveName}`));
      }

      const currentlySupported = downloads[downloadId].game;
      const supportedGames = new Set<string>(
        currentlySupported.concat(Object.keys(getSupportMap())));
      api.store.dispatch(actions.setCompatibleGames(downloadId, Array.from(supportedGames)));
      if (downloadInfo.allowAutoInstall && state.settings.automation?.['install'] !== true) {
        const mods: { [modId: string]: types.IMod } =
          util.getSafe(state, ['persistent', 'mods', downloadInfo.gameId], {});
        const isInjectorInstalled = Object.keys(mods).find(id => mods[id].type === 'bepinex-injector') !== undefined;
        if (!isInjectorInstalled) {
          api.events.emit('start-install-download', downloadId);
        }
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
  const isInjectorInstalled = (!force)
    ? Object.keys(mods).find(id => mods[id].type === 'bepinex-injector') !== undefined
    : false;

  if (isInjectorInstalled) {
    // We have a mod installed with the injector modType, do nothing.
    return;
  }

  if (gameConf.customPackDownloader !== undefined) {
    try {
      const downloadRes = await gameConf.customPackDownloader(util.getVortexPath('temp'));
      if (downloadRes as INexusDownloadInfo !== undefined) {
        await download(api, (downloadRes as INexusDownloadInfo));
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
      log('error', 'failed to download custom pack', err);
      return;
    }
  } else {
    try {
      await download(api, {
        gameId: gameConf.gameId,
        domainId: 'site',
        modId: '115',
        fileId: '956',
        archiveName: 'BepInEx_x64_5.4.8.0.zip',
        allowAutoInstall: true,
      });
    } catch (err) {
      log('error', 'failed to download default pack', err);
    }
  }
}
