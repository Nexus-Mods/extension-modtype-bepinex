import * as path from 'path';
import { log, selectors, types, util } from 'vortex-api';

import AttribDashlet from './AttribDashlet';

import { ensureBepInExPack } from './bepInExDownloader';
import { addGameSupport, getSupportMap } from './common';
import { installInjector, installRootMod,
  testSupportedBepInExInjector, testSupportedRootMod } from './installers';
import { IBepInExGameConfig, NotPremiumError } from './types';
import { createDirectories, toBlue } from './util';

function showAttrib(state: types.IState) {
  const gameMode = selectors.activeGameId(state);
  return getSupportMap()[gameMode] !== undefined;
}

function isSupported(gameId: string) {
  const isGameSupported = !['valheim'].includes(gameId);
  const isRegistered = getSupportMap()[gameId] !== undefined;
  return isGameSupported && isRegistered;
}

function init(context: types.IExtensionContext) {
  const getPath = (game: types.IGame): string => {
    const state: types.IState = context.api.getState();
    const gameConf: IBepInExGameConfig = getSupportMap()[game.id];
    const discovery = state.settings.gameMode.discovered[game.id];
    if (gameConf !== undefined && discovery?.path !== undefined) {
      return (gameConf.installRelPath !== undefined)
        ? path.join(discovery.path, gameConf.installRelPath)
        : discovery.path;
    } else {
      return undefined;
    }
  };

  const genTestProps = (gameId?: string) => {
    const state = context.api.getState();
    const activeGameId = (gameId === undefined)
      ? selectors.activeGameId(state)
      : gameId;
    const gameConf = getSupportMap()[activeGameId];
    const game: types.IGameStored = selectors.gameById(state, activeGameId);
    return { gameConf, game };
  };

  // A dummy modType test for modTypes we do not want to assign automatically.
  const modTypeTest = toBlue(() => Promise.resolve(false));

  // Regular DLL plugin modType test
  const pluginModTypeTest = (async (instructions: types.IInstruction[]) => {
    const copyInstructions = instructions.filter(instr => (instr.type === 'copy')
      && path.extname(path.basename(instr.destination)));

    return (copyInstructions.find(instr =>
      path.extname(instr.destination) === '.dll') !== undefined);
  });

  const rootModTypeTest = (async (instructions: types.IInstruction[]) => {
    const bixRootFolders: string[] = ['plugins', 'patchers', 'config'];
    const isRootSegment = (seg: string) => (seg !== undefined)
      ? bixRootFolders.includes(seg.toLowerCase())
      : false;
    const copyInstructions = instructions.filter(instr => (instr.type === 'copy')
      && path.extname(path.basename(instr.destination)));

    for (const instr of copyInstructions) {
      const segments = instr.destination.split(path.sep);
      const rootSeg = segments.find(isRootSegment);
      if (rootSeg && segments.indexOf(rootSeg) === 0) {
        // The instructions have an expected root segment
        //  right at the root of the mod's installation folder,
        //  this is a root mod.
        return true;
      }
    }

    return false;
  });

  context.registerDashlet('BepInEx Support', 1, 2, 250, AttribDashlet,
    showAttrib, () => ({}), undefined);

  context.registerAPI('bepinexAddGame', (bepinexConf: IBepInExGameConfig,
                                         callback?: (err: Error) => void) => {
    if ((bepinexConf !== undefined) || ((bepinexConf as IBepInExGameConfig) === undefined)) {
      addGameSupport(bepinexConf);
    } else {
      callback?.(new util.DataInvalid('failed to register bepinex game, invalid object received'));
    }
  }, { minArguments: 1 });

  // This modType is assigned by the BepInEx injector installer.
  context.registerModType('bepinex-injector', 10, isSupported, getPath, modTypeTest, {
    mergeMods: true,
    name: 'Bepis Injector Extensible',
  });

  // Assigned to any mod that contains the plugins, patchers, config directories
  context.registerModType('bepinex-root', 50, isSupported,
  (game: types.IGame) => path.join(getPath(game), 'BepInEx'), toBlue(rootModTypeTest), {
    mergeMods: true,
    name: '../BepInEx/',
  });

  context.registerModType('bepinex-plugin', 60, isSupported,
    (game: types.IGame) => path.join(getPath(game), 'BepInEx', 'plugins'),
    toBlue(pluginModTypeTest), {
    mergeMods: true,
    name: '../BepInEx/plugins/',
  });

  // There's currently no reliable way to differentiate BepInEx plugins from patchers,
  //  apart from the mod's description specifying where to deploy the mod. Unlike regular
  //  plugins, patchers should only be used only in special cases, which is why
  //  we don't want this to be assigned by default.
  context.registerModType('bepinex-patcher', 25, isSupported,
    (game: types.IGame) => path.join(getPath(game), 'BepInEx', 'patchers'),
    toBlue(() => Promise.resolve(false)), {
    mergeMods: true,
    name: '../BepInEx/patchers/',
  });

  context.registerInstaller('bepis-injector-extensible', 50,
    toBlue((files) => testSupportedBepInExInjector(context.api, files)),
    toBlue(installInjector));

  context.registerInstaller('bepinex-root', 50,
    toBlue((files) => testSupportedRootMod(context.api, files)),
    toBlue(installRootMod));

  context.registerTest('bepinex-config-test', 'gamemode-activated',
    toBlue(() => {
      const { game, gameConf } = genTestProps();
      return (gameConf?.validateBepInExConfiguration !== undefined)
        ? gameConf.validateBepInExConfiguration(getPath(game as any))
        : Promise.resolve(undefined);
    }));

  context.registerTest('doorstop-config-test', 'gamemode-activated',
    toBlue(() => {
      const { game, gameConf } = genTestProps();
      return (gameConf?.doorstopConfig?.validateDoorStopConfig !== undefined)
        ? gameConf.doorstopConfig.validateDoorStopConfig(getPath(game as any))
        : Promise.resolve(undefined);
    }));

  context.once(() => {
    context.api.events.on('gamemode-activated', async (gameMode: string) => {
      const t = context.api.translate;
      if (!isSupported(gameMode)) {
        return;
      }

      const { gameConf } = genTestProps(gameMode);

      try {
        await createDirectories(context.api, gameConf);
      } catch (err) {
        log('error', 'failed to create BepInEx directories', err);
        return;
      }
      const replace = {
        game: gameMode,
        bl: '[br][/br][br][/br]',
        bixUrl: '[url=https://github.com/BepInEx/BepInEx/releases]BepInEx Release[/url]',
      };
      const dialogContents = (gameConf.autoDownloadBepInEx)
        ? t('The {{game}} game extension requires a widely used 3rd party assembly '
          + 'patching/injection library called Bepis Injector Extensible (BepInEx).{{bl}}'
          + 'Vortex has downloaded and installed this library automatically for you, and is currently '
          + 'available in your mods page to enable/disable just like any other regular mod. '
          + 'Depending on the modding pattern of {{game}}, BepInEx may be a hard requirement '
          + 'for mods to function in-game in which case you MUST have the library enabled and deployed '
          + 'at all times for the mods to work!{{bl}}'
          + 'To remove the library, simply disable the mod entry for BepInEx.'
          , { replace })
        : t('The {{game}} game extension requires a widely used 3rd party assembly '
          + 'patching/injection library called Bepis Injector Extensible (BepInEx).{{bl}}'
          + 'BepInEx may be a hard requirement for some mods to function in-game in which case you should '
          + 'manually download and install the latest {{bixUrl}} in order for the mods to work!{{bl}}'
          + 'Choose the "BepInEx_x64_...zip" variant - you can then drag and drop it inside the mods page\'s '
          + '"Drop area" to have Vortex install it as any other mod.{{bl}}'
          + 'If you installed the BepInEx package through Vortex, don\'t forget to enable it and click "Deploy Mods", '
          + 'for the package to be linked to your game\'s directory.'
          , { replace });

      return ensureBepInExPack(context.api)
        .then(() => context.api.sendNotification({
          id: 'bepis_injector' + gameMode,
          type: 'info',
          allowSuppress: true,
          message: 'The {{game}} extension uses BepInEx',
          actions: [
            {
              title: 'More',
              action: () => context.api.showDialog('info', 'Bepis Injector Extensible', {
                bbcode: dialogContents,
              }, [ { label: 'Close' } ]),
            },
          ],
          replace,
        }))
        .catch(err => {
          return (err instanceof NotPremiumError)
            ? Promise.resolve()
            : context.api.showErrorNotification('Failed to download/install BepInEx', err);
        });
    });

    context.api.onAsync('will-deploy', async (profileId: string) => {
      const state = context.api.getState();
      const activeProfile: types.IProfile = selectors.activeProfile(state);
      const profile = selectors.profileById(state, profileId);
      if (profile?.gameId === undefined || profile.gameId !== activeProfile?.gameId) {
        return;
      }

      if (!isSupported(profile.gameId)) {
        return;
      }
      return ensureBepInExPack(context.api, profile.gameId)
      .catch(err => {
        return (err instanceof NotPremiumError)
          ? Promise.resolve()
          : context.api.showErrorNotification('Failed to download/install BepInEx', err);
      });
    });
  });

  return true;
}

export default init;
