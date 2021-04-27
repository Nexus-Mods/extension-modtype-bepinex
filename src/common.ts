import { IBepInExGameConfig, INexusDownloadInfoExt } from './types';

export const NEXUS = 'www.nexusmods.com';
export const DOORSTOPPER_HOOK = 'winhttp.dll';
export const DOORSTOPPER_CONFIG = 'doorstop_config.ini';
export const DOORSTOP_FILES: string[] = [DOORSTOPPER_CONFIG, DOORSTOPPER_HOOK];
export const INJECTOR_FILES: string[] = [
  '0Harmony.dll', '0Harmony.xml', '0Harmony20.dll', 'BepInEx.dll', 'BepInEx.Harmony.dll',
  'BepInEx.Harmony.xml', 'BepInEx.Preloader.dll', 'BepInEx.Preloader.xml',
  'BepInEx.xml', 'HarmonyXInterop.dll', 'Mono.Cecil.dll', 'Mono.Cecil.Mdb.dll',
  'Mono.Cecil.Pdb.dll', 'Mono.Cecil.Rocks.dll', 'MonoMod.RuntimeDetour.dll',
  'MonoMod.RuntimeDetour.xml', 'MonoMod.Utils.dll', 'MonoMod.Utils.xml',
];

const GAME_SUPPORT: { [gameId: string]: IBepInExGameConfig } = {};
export const getSupportMap = () => GAME_SUPPORT;
export const addGameSupport = (gameConf: IBepInExGameConfig) => {
  GAME_SUPPORT[gameConf.gameId] = gameConf;
};

export const getDefaultDownload = (gameId): INexusDownloadInfoExt => ({
  gameId,
  domainId: 'site',
  modId: '115',
  fileId: '1023',
  archiveName: 'BepInEx_x64_5.4.10.0.zip',
  allowAutoInstall: true,
  githubUrl: 'https://github.com/BepInEx/BepInEx/releases/tag/v5.4.10',
});
