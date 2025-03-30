import type { API } from 'homebridge';

import { GreeG10HomebridgePlatformPlugin } from './platform.js';
import { PLATFORM_NAME } from './settings.js';

/**
 * This method registers the platform with Homebridge
 */
export default (api: API) => {
  api.registerPlatform(PLATFORM_NAME, GreeG10HomebridgePlatformPlugin);
};
