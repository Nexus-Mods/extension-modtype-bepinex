import * as path from 'path';
import { log, selectors, types, util } from 'vortex-api';

import AttribDashlet from './AttribDashlet';

import { ensureBepInExPack } from './bepInExDownloader';
import { addGameSupport, getSupportMap } from './common';
import { installInjector, installRootMod,
  testSupportedBepInExInjector, testSupportedRootMod } from './installers';
import { IBepInExGameConfig } from './types';
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

  // There's currently no reliable way to differentiate BepInEx plugins from patchers,
  //  apart from the mod's description specifying where to deploy the mod. Which is why
  //  we're going to rely on the user or the game extension's installers to define which
  //  modType to use.
  const modTypeTest = toBlue(() => Promise.resolve(false));

  context.registerDashlet('BepInEx Support', 1, 2, 250, AttribDashlet,
    showAttrib, () => ({}), undefined);

  context.registerAPI('bepinexAddGame', (bepinexConf: IBepInExGameConfig,
                                         callback?: (err: Error) => void) => {
    if ((bepinexConf !== undefined) || ((bepinexConf as IBepInExGameConfig) === undefined)) {
      addGameSupport(bepinexConf);
      if (bepinexConf.autoDownloadBepInEx) {
        ensureBepInExPack(context.api);
      }
    } else {
      callback?.(new util.DataInvalid('failed to register bepinex game, invalid object received'));
    }
  }, { minArguments: 1 });

  context.registerModType('bepinex-injector', 25, isSupported, getPath, modTypeTest, {
    mergeMods: true,
    name: 'Bepis Injector Extensible',
  });

  context.registerModType('bepinex-root', 25, isSupported,
  (game: types.IGame) => path.join(getPath(game), 'BepInEx'), modTypeTest, {
    mergeMods: true,
    name: 'BepInEx Root',
  });

  context.registerModType('bepinex-plugin', 25, isSupported,
    (game: types.IGame) => path.join(getPath(game), 'BepInEx', 'plugins'), modTypeTest, {
    mergeMods: true,
    name: 'BepInEx Plugin',
  });

  context.registerModType('bepinex-patcher', 25, isSupported,
    (game: types.IGame) => path.join(getPath(game), 'BepInEx', 'patchers'), modTypeTest, {
    mergeMods: true,
    name: 'BepInEx Patcher',
  });

  context.registerInstaller('bepis-injector-extensible', 50,
    toBlue((files) => testSupportedBepInExInjector(context.api, files)),
    toBlue(installInjector));

  context.registerInstaller('bepinex-root', 25,
    toBlue((files) => testSupportedRootMod(context.api, files)),
    toBlue(installRootMod));

  const genTestProps = () => {
    const state = context.api.getState();
    const activeGameId = selectors.activeGameId(state);
    const gameConf = getSupportMap()[activeGameId];
    const game: types.IGameStored = selectors.gameById(state, activeGameId);
    return { gameConf, game };
  };

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

      try {
        await createDirectories(context.api, getSupportMap()[gameMode]);
      } catch (err) {
        log('error', 'failed to create BepInEx directories', err);
        return;
      }
      const replace = {
        game: gameMode,
        bl: '[br][/br][br][/br]',
      };
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
                bbcode: t('The {{game}} game extension requires a widely used 3rd party assembly '
                  + 'patching/injection library called Bepis Injector Extensible (BepInEx).{{bl}}'
                  + 'Vortex has downloaded and installed this library automatically for you, and is currently '
                  + 'available in your mods page to enable/disable just like any other regular mod. '
                  + 'Depending on the modding pattern of {{game}}, BepInEx may be a hard requirement '
                  + 'for mods to function in-game in which case you MUST have the library enabled and deployed '
                  + 'at all times for the mods to work!{{bl}}'
                  + 'To remove the library, simply disable the mod entry for BepInEx.'
                  , { replace }),
              }, [ { label: 'Close' } ]),
            },
          ],
          replace,
        }));
    });

    context.api.onAsync('will-deploy', async (profileId: string) => {
      const state = context.api.getState();
      const profile = selectors.profileById(state, profileId);
      if (profile?.gameId === undefined) {
        return;
      }

      if (!isSupported(profile.gameId)) {
        return;
      }
      return ensureBepInExPack(context.api, profile.gameId);
    });
  });

  return true;
}

export default init;
