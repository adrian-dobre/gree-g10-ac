import type { CharacteristicValue, Logging, PlatformAccessory, Service } from 'homebridge';

import type { GreeG10HomebridgePlatformPlugin } from './platform.js';
import mqtt from 'mqtt/*';
import debounce from 'lodash/debounce.js';

type StateProps = {
  active: CharacteristicValue,
  currentState: CharacteristicValue,
  targetState: CharacteristicValue,
  coolingTemperature: CharacteristicValue,
  heatingTemperature: CharacteristicValue,
  currentTemperature: CharacteristicValue,
  speed: CharacteristicValue,
  swing: CharacteristicValue
};

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class GreeG10PlatformAccessory {
  private service: Service;

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
      active: this.platform.Characteristic.Active.INACTIVE,
      currentState: this.platform.Characteristic.CurrentHeaterCoolerState.COOLING,
      targetState: this.platform.Characteristic.TargetHeaterCoolerState.COOL,
      currentTemperature: 25,
      coolingTemperature: 22,
      heatingTemperature: 18,
      speed: 2,
      swing: this.platform.Characteristic.SwingMode.SWING_ENABLED,
    };

    // set accessory information
    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'Madtek')
      .setCharacteristic(this.platform.Characteristic.Model, 'G10Controller')
      .setCharacteristic(this.platform.Characteristic.SerialNumber, '0001');

    this.service = this.accessory.getService(this.platform.Service.HeaterCooler) || this.accessory.addService(this.platform.Service.HeaterCooler);

    // set the service name, this is what is displayed as the default name on the Home app
    // in this example we are using the name we stored in the `accessory.context` in the `discoverDevices` method.
    this.service.setCharacteristic(this.platform.Characteristic.Name, accessory.context.device.name);

    this.service.getCharacteristic(this.platform.Characteristic.Active)
      .onGet(() => this.state.active)
      .onSet((value) => {
        this.log.info(`Active: ${value}`);
        this.updateState({ active: value }, true);
      });

    this.service.getCharacteristic(this.platform.Characteristic.CurrentHeaterCoolerState)
      .onGet(() => this.state.currentState);

    this.service.getCharacteristic(this.platform.Characteristic.TargetHeaterCoolerState)
      .onGet(() => this.state.targetState)
      .onSet((value) => {
        this.log.info(`TargetHeaterCoolerState: ${value}`);
        this.updateState({ targetState: value }, true);
      });

    this.service.getCharacteristic(this.platform.Characteristic.CurrentTemperature)
      .onGet(() => this.state.currentTemperature);


    this.service.getCharacteristic(this.platform.Characteristic.RotationSpeed)
      .onGet(() => this.state.speed)
      .onSet((value) => {
        this.log.info(`RotationSpeed: ${value}`);
        this.updateState({ speed: value }, true);
      }).setProps({
        minValue: 0,
        maxValue: 4,
        minStep: 1,
      });

    this.service.getCharacteristic(this.platform.Characteristic.SwingMode)
      .onGet(() => this.state.swing)
      .onSet((value) => {
        this.log.info(`SwingMode: ${value}`);
        this.updateState({ swing: value }, true);
      });

    this.service.getCharacteristic(this.platform.Characteristic.CoolingThresholdTemperature)
      .onGet(() => this.state.coolingTemperature)
      .onSet((value) => {
        this.log.info(`CoolingThresholdTemperature: ${value}`);
        this.updateState({ coolingTemperature: value }, true);
      }).setProps({ minStep: 1 });

    this.service.getCharacteristic(this.platform.Characteristic.HeatingThresholdTemperature)
      .onGet(() => this.state.heatingTemperature)
      .onSet((value) => {
        this.log.info(`HeatingThresholdTemperature: ${value}`);
        this.updateState({ heatingTemperature: value }, true);
      }).setProps({ minStep: 1 });


    this.mqttClient.on('message', (topic, message) => {
      this.log.info(`${topic} - ${message.toString()}`);
      if (topic === 'ac/g10/stats') {
        const data = JSON.parse(message.toString()) as unknown as {
          temperature: number;
        };
        this.updateState({ currentTemperature: data.temperature });
        this.service.updateCharacteristic(this.platform.Characteristic.CurrentTemperature, this.state.currentTemperature);
      }
    });
  }

  private updateState(update: Partial<StateProps>, sendCommand = false) {
    this.state = { ...this.state, ...update };
    if (sendCommand) {
      this.sendCommand();
    }
  }

  private sendCommand = debounce(() => {
    const acTarget = this.getACTarget();
    const command = {
      'power': this.state.active,
      'mode': acTarget.mode,
      'speed': this.state.speed === 4 ? 3 : this.state.speed,
      'temperature': acTarget.temperature,
      'verticalSwing': this.state.swing === this.platform.Characteristic.SwingMode.SWING_ENABLED ? 1 : 4,
      'turbo': this.state.speed === 4,
      'iFeel': true,
    };
    this.log.info(JSON.stringify(command));
    this.mqttClient.publish('ac/g10/command', JSON.stringify(command));
  }, 1000);

  private getACTarget(): { mode: number, temperature: number } {
    const { targetState, currentTemperature, heatingTemperature, coolingTemperature } = this.state;
    let target = {
      mode: 2,
      temperature: coolingTemperature as number,
    };
    switch (targetState) {
      case this.platform.Characteristic.TargetHeaterCoolerState.AUTO:
        if (currentTemperature >= coolingTemperature) {
          this.updateState({ currentState: this.platform.Characteristic.CurrentHeaterCoolerState.COOLING });
          target = { mode: 3, temperature: coolingTemperature as number };
        } else if (currentTemperature < heatingTemperature) {
          this.updateState({ currentState: this.platform.Characteristic.CurrentHeaterCoolerState.HEATING });
          target = { mode: 2, temperature: heatingTemperature as number };
        }
        break;

      case this.platform.Characteristic.TargetHeaterCoolerState.COOL:
        this.updateState({ currentState: this.platform.Characteristic.CurrentHeaterCoolerState.COOLING });
        target = { mode: 3, temperature: coolingTemperature as number };
        break;

      case this.platform.Characteristic.TargetHeaterCoolerState.HEAT:
        this.updateState({ currentState: this.platform.Characteristic.CurrentHeaterCoolerState.HEATING });
        target = { mode: 2, temperature: heatingTemperature as number };
        break;

    }
    return target;
  }
}
