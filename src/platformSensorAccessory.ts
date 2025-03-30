import type { Logging, PlatformAccessory, Service } from 'homebridge';

import type { GreeG10HomebridgePlatformPlugin } from './platform.js';
import mqtt from 'mqtt/*';

type StateProps = {
  relativeHumidity: number,
};

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class GreeG10PlatformSensorAccessory {
  private humiditySensor: Service;

  /**
   * These are just used to create a working example
   * You should implement your own code to track the state of your accessory
   */
  private state: StateProps;

  constructor(
    private readonly platform: GreeG10HomebridgePlatformPlugin,
    private readonly accessory: PlatformAccessory,
    private readonly mqttClient: mqtt.MqttClient,
    private readonly log: Logging,
  ) {

    this.state = {
      relativeHumidity: 50,
    };

    // set accessory information
    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'Madtek')
      .setCharacteristic(this.platform.Characteristic.Model, 'HumiditySensor')
      .setCharacteristic(this.platform.Characteristic.SerialNumber, '0001');

    this.humiditySensor = this.accessory.getService(this.platform.Service.HumiditySensor) || this.accessory.addService(this.platform.Service.HumiditySensor);

    // set the service name, this is what is displayed as the default name on the Home app
    // in this example we are using the name we stored in the `accessory.context` in the `discoverDevices` method.
    this.humiditySensor.setCharacteristic(this.platform.Characteristic.Name, accessory.context.device.name);
    this.humiditySensor.getCharacteristic(this.platform.Characteristic.CurrentRelativeHumidity)
      .onGet(() => this.state.relativeHumidity);

    this.mqttClient.on('message', (topic, message) => {
      this.log.info(`${topic} - ${message.toString()}`);
      if (topic === 'ac/g10/stats') {
        const data = JSON.parse(message.toString()) as unknown as {
          humidity: number;
        };
        this.updateState({ relativeHumidity: data.humidity });
        this.humiditySensor.updateCharacteristic(this.platform.Characteristic.CurrentRelativeHumidity, this.state.relativeHumidity);
      }
    });
  }

  private updateState(update: Partial<StateProps>) {
    this.state = { ...this.state, ...update };
  }
}
