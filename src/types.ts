import { types } from 'vortex-api';

export type UnityDoorstopType = 'none' | 'default' | 'unity3';

export interface IDoorstopConfig {
  // Depending on the game's modding pattern, the doorstop assembly
  //  can be installed as winhttp.dll, version.dll or not at all; winhttp.dll
  //  will generally work for all Unity games, but version.dll appears to be
  //  more functional when used with unity3 games.
  doorstopType: UnityDoorstopType;

  // Relative/Absolute path to the target assembly, by default this will be set
  //  to BepInEx's preloader.
  targetAssembly?: string;

  // Will ignore the DOORSTOP_DISABLE environment variable if set to true.
  ignoreDisableSwitch?: boolean;

  // This refers to the game's unity log; if set to true the log will be redirected
  //  to the folder where the doorstop assembly is located ../output_log.txt
  redirectOutputLog?: boolean;

  // Relative path to the game's mono/unity dependencies. This is useful
  //  if the game's assemblies are optimised/have functionality stripped.
  dllOverrideRelPath?: string;

  // Some game extensions may want to validate the doorstop's configuration
  //  or assembly version, etc. This test will be kicked off on extension activation.
  validateDoorStopConfig?: (doorStopAssemblyPath: string) => Promise<types.ITestResult>;
}

export interface IBepInExGameConfig {
  // Nexus Mods GameId.
  gameId: string;

  // We're able to auto download the BepInEx package
  autoDownloadBepInEx: boolean;

  // Relative path to the game's root directory where
  //  the game extension requires the BepInEx folder to be
  //  deployed to. Generally this should never have to be used
  //  as long as the game executable is located at the game's root path.
  installRelPath?: string;

  // Gives the game extension the ability to configure the Unity Doorstop mechanism.
  //  Default values are used if this property is not defined.
  doorstopConfig?: IDoorstopConfig;

  // The game extension can have its own downloader code defined if the default
  //  BepInEx package is not compatible with the game. This functor expects
  //  the extension to return the path to the archive (7z, rar, zip) containing
  //  the BepInEx package; OR the NexusMods file details required to download the pack
  //  from the website. The vortexTempDirPath property will provide the user
  //  with a suggested location where the archive should/could be created without
  //  fearing permissions related issues (hopefully)
  customPackDownloader?: (vortexTempDirPath: string) => Promise<string | INexusDownloadInfo>;

  // Allows the game extension to validate the bepinex configuration/installation
  //  and inform the user if something is off. This test will be kicked off on
  //  extension activation.
  validateBepInExConfiguration?: (bepinexPath: string) => Promise<types.ITestResult>;
}

export interface INexusDownloadInfo {
  // Refers to the domain of the package which is usually just a gameId unless 'site'
  //  is used instead.
  domainId: string;

  // The game we're downloading the file for - used to install the BepInEx package
  //  as soon as we finish downloading it (when auto installation is enabled)
  gameId: string;

  // The numerical id of the mod.
  modId: string;

  // The id of the specific file we want to download.
  fileId: string;

  // The name of the archive including its extension (i.e. '.zip', '.7z', etc).
  archiveName: string;

  // Whether we we're ok to have the download automatically install when download
  //  completes.
  allowAutoInstall?: boolean;
}
