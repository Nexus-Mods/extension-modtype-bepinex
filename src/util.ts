import Bluebird from 'bluebird';
import { fs, selectors, types } from 'vortex-api';

import { IBepInExGameConfig } from './types';

// We _should_ just export this from vortex-api, but I guess it's not wise to make it
//  easy for users since we want to move away from bluebird in the future ?
export function toBlue<T>(func: (...args: any[]) => Promise<T>): (...args: any[]) => Bluebird<T> {
  return (...args: any[]) => Bluebird.resolve(func(...args));
}

export async function createDirectories(api: types.IExtensionApi, config: IBepInExGameConfig) {
  const state = api.getState();
  const modTypes: { [typeId: string]: string } = selectors.modPathsForGame(state, config.gameId);
  for (const id of Object.keys(modTypes)) {
    await fs.ensureDirWritableAsync(modTypes[id]);
  }
}
