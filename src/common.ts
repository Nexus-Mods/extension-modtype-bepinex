import path from 'path';
import { IAvailableDownloads, IBepInExGameConfig, INexusDownloadInfoExt } from './types';

import semver from 'semver';

export const NEXUS = 'www.nexusmods.com';
export const DOORSTOPPER_HOOK = 'winhttp.dll';
export const DOORSTOPPER_CONFIG = 'doorstop_config.ini';
export const BEPINEX_CONFIG_FILE = 'BepInEx.cfg';
export const BEPINEX_CONFIG_REL_PATH = path.join('BepInEx', 'config', BEPINEX_CONFIG_FILE);
export const DOORSTOP_FILES: string[] = [DOORSTOPPER_CONFIG, DOORSTOPPER_HOOK];
export const INJECTOR_FILES: string[] = [
  '0Harmony.dll', '0Harmony.xml', '0Harmony20.dll', 'BepInEx.dll', 'BepInEx.Core.dll',
  'BepInEx.Preloader.Core.dll', 'BepInEx.Preloader.Unity.dll', 'BepInEx.Harmony.dll',
  'BepInEx.Harmony.xml', 'BepInEx.Preloader.dll', 'BepInEx.Preloader.xml',
  'BepInEx.xml', 'HarmonyXInterop.dll', 'Mono.Cecil.dll', 'Mono.Cecil.Mdb.dll',
  'Mono.Cecil.Pdb.dll', 'Mono.Cecil.Rocks.dll', 'MonoMod.RuntimeDetour.dll',
  'MonoMod.RuntimeDetour.xml', 'MonoMod.Utils.dll', 'MonoMod.Utils.xml',
];

const GAME_SUPPORT: { [gameId: string]: IBepInExGameConfig } = {};
export const getSupportMap = () => GAME_SUPPORT;
export const generateRegExp = (gameConf: IBepInExGameConfig): RegExp => {
  // Depending on the game config's github parameters this will generate a regexp
  //  that will match the download link for the BepInEx package.
  const { architecture, bepinexVersion, unityBuild } = gameConf;
  const arch = architecture !== undefined ? architecture : 'x64';
  const version = bepinexVersion !== undefined ? bepinexVersion : '.*';
  const unity = unityBuild !== undefined ? `${unityBuild}_` : '';
  const regex = `BepInEx_${unity}${arch}_${version}.*[.zip|.7z]`;
  return new RegExp(regex, 'i');
}

export const addGameSupport = (gameConf: IBepInExGameConfig) => {
  if ((gameConf.unityBuild === 'unityil2cpp')
   && (gameConf.bepinexVersion !== undefined)
   && (semver.lt(gameConf.bepinexVersion, '6.0.0'))) {
    throw new Error('IL2CPP builds require BepInEx 6.0.0 or above');
  } else {
    if (gameConf.unityBuild === 'unityil2cpp' && gameConf.bepinexVersion === undefined) {
      gameConf.bepinexVersion = '6.0.0';
    }
    GAME_SUPPORT[gameConf.gameId] = gameConf;
  }
};

const AVAILABLE: IAvailableDownloads = {
  '5.4.10': {
    domainId: 'site',
    modId: '115',
    fileId: '1023',
    archiveName: 'BepInEx_x64_5.4.10.0.zip',
    allowAutoInstall: true,
    githubUrl: 'https://github.com/BepInEx/BepInEx/releases/tag/v5.4.10',
  },
  '5.4.13': {
    domainId: 'site',
    modId: '115',
    fileId: '1137',
    archiveName: 'BepInEx_x64_5.4.13.0.zip',
    allowAutoInstall: true,
    githubUrl: 'https://github.com/BepInEx/BepInEx/releases/tag/v5.4.13',
  },
  '5.4.15': {
    domainId: 'site',
    modId: '115',
    fileId: '1175',
    archiveName: 'BepInEx_x64_5.4.15.0.zip',
    allowAutoInstall: true,
    githubUrl: 'https://github.com/BepInEx/BepInEx/releases/tag/v5.4.15',
  },
  '5.4.17': {
    domainId: 'site',
    modId: '115',
    fileId: '1273',
    archiveName: 'BepInEx_x64_5.4.17.0.zip',
    allowAutoInstall: true,
    githubUrl: 'https://github.com/BepInEx/BepInEx/releases/tag/v5.4.17',
  },
};

const getLatestVersion = (): string => {
  const versions = Object.keys(AVAILABLE);
  const latestVersion = versions.reduce((prev, iter) => {
    if (semver.gt(iter, prev)) {
      prev = iter;
    }
    return prev;
  }, '5.4.10');
  return latestVersion;
};

export const getDownload = (gameConf: IBepInExGameConfig): INexusDownloadInfoExt => {
  const download: INexusDownloadInfoExt = ((gameConf.bepinexVersion !== undefined)
        && Object.keys(AVAILABLE).includes(gameConf.bepinexVersion))
    ? AVAILABLE[gameConf.bepinexVersion] : AVAILABLE[getLatestVersion()];
  return {
    ...download,
    gameId: gameConf.gameId,
  };
};
