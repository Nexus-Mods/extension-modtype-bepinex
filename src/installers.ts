import path from 'path';
import Parser, { IniFile, WinapiFormat } from 'vortex-parse-ini';
import { DOORSTOPPER_CONFIG, DOORSTOPPER_HOOK, getSupportMap,
  INJECTOR_FILES } from './common';
import { IBepInExGameConfig, IDoorstopConfig, UnityDoorstopType } from './types';

import { selectors, types } from 'vortex-api';

function makeCopy(source: string, gameConfig: IBepInExGameConfig,
                  alternativeFileName?: string): types.IInstruction {
  const filePath = (alternativeFileName !== undefined)
    ? source.replace(path.basename(source), alternativeFileName)
    : source;
  const destination = (gameConfig.installRelPath !== undefined)
    ? path.join(gameConfig.installRelPath, filePath)
    : filePath;
  return {
    type: 'copy',
    source,
    destination,
  };
}

async function applyDoorStopConfig(config: IDoorstopConfig, filePath: string) {
  const parser = new Parser(new WinapiFormat());
  const iniData: IniFile<any> = await parser.read(filePath);
  iniData.data['UnityDoorstop']['enabled'] = true;
  iniData.data['UnityDoorstop']['targetAssembly'] = config.targetAssembly !== undefined
    ? config.targetAssembly : 'BepInEx\\core\\BepInEx.Preloader.dll';
  iniData.data['UnityDoorstop']['redirectOutputLog'] = config.redirectOutputLog !== undefined
    ? config.redirectOutputLog : false;
  iniData.data['UnityDoorstop']['ignoreDisableSwitch'] = config.ignoreDisableSwitch !== undefined
    ? config.ignoreDisableSwitch : true;
  iniData.data['UnityDoorstop']['dllSearchPathOverride'] = config.dllOverrideRelPath !== undefined
    ? config.dllOverrideRelPath : '';
  return parser.write(filePath, iniData);
}

export async function testSupportedBepInExInjector(api: types.IExtensionApi, files: string[])
  : Promise<types.ISupportedResult> {
  const activeGameId = selectors.activeGameId(api.getState());
  if (getSupportMap()[activeGameId] === undefined) {
    return { supported: false, requiredFiles: [] };
  }

  const filesMatched = files.filter(file =>
    INJECTOR_FILES.map(f => f.toLowerCase()).includes(path.basename(file).toLowerCase()));
  return Promise.resolve({
    supported: (filesMatched.length === INJECTOR_FILES.length),
    requiredFiles: [],
  });
}

export async function installInjector(files: string[],
                                      destinationPath: string,
                                      gameId: string): Promise<types.IInstallResult> {
  const gameConfig = getSupportMap()[gameId];
  const doorStopConfig = gameConfig.doorstopConfig;
  const doorstopType: UnityDoorstopType = doorStopConfig?.doorstopType !== undefined
    ? doorStopConfig.doorstopType : 'default';
  const modTypeInstruction: types.IInstruction = {
    type: 'setmodtype',
    value: 'bepinex-injector',
  };
  const attribInstr: types.IInstruction = {
    type: 'attribute',
    key: 'customFileName',
    value: 'Bepis Injector Extensible',
  };
  if (doorStopConfig !== undefined) {
    try {
      const configFilePath = files.find(file => path.basename(file) === DOORSTOPPER_CONFIG);
      if (configFilePath !== undefined) {
        // This BIX package uses UnityDoorstop - attempt to modify the configuration.
        await applyDoorStopConfig(doorStopConfig, path.join(destinationPath, configFilePath));
      }
    } catch (err) {
      return Promise.reject(err);
    }
  }
  const instructions: types.IInstruction[] = files.reduce((accum, file) => {
    if (!path.extname(file)) {
      return accum;
    }
    if ((doorstopType !== 'default') && path.basename(file).toLowerCase() === DOORSTOPPER_HOOK) {
      switch (doorstopType) {
        case 'unity3': {
          accum.push(makeCopy(file, gameConfig, 'version.dll'));
          break;
        }
        case 'none': {
          return accum;
        }
      }
    } else {
      accum.push(makeCopy(file, gameConfig));
    }
    return accum;
  }, [modTypeInstruction, attribInstr]);

  return Promise.resolve({ instructions });
}

const ROOT_DIRS = ['plugins', 'config', 'patchers'];
export async function testSupportedRootMod(api: types.IExtensionApi,
                                           files: string[]): Promise<types.ISupportedResult> {
  const activeGameId = selectors.activeGameId(api.getState());
  if (getSupportMap()[activeGameId] === undefined) {
    return { supported: false, requiredFiles: [] };
  }

  const filtered = files.filter(file => {
    // We expect the root mod to have the same directory structure as BepInEx's
    //  root directory, which means that the very first segments should have a
    //  patchers, plugins or config directory.
    const segments = file.split(path.sep);
    return ROOT_DIRS.includes(segments[0]);
  });

  return { supported: filtered.length > 0, requiredFiles: [] };
}

export async function installRootMod(files: string[],
                                     destinationPath: string,
                                     gameId: string): Promise<types.IInstallResult> {
  const gameConfig = getSupportMap()[gameId];
  const modTypeInstruction: types.IInstruction = {
    type: 'setmodtype',
    value: 'bepinex-root',
  };
  const instructions: types.IInstruction[] = files.map(file => makeCopy(file, gameConfig));
  instructions.push(modTypeInstruction);
  return Promise.resolve({ instructions });
}
