import { PlayerCameraChoreographyGameScene } from './PlayerCameraChoreographyGameScene';
import { SettingsMenu } from './SettingsMenu';

export class ProductionGameScene extends PlayerCameraChoreographyGameScene {
  private settingsMenu?: SettingsMenu;

  create(): void {
    super.create();

    this.settingsMenu = new SettingsMenu();
    this.settingsMenu.install();

    this.events.once('shutdown', () => {
      this.settingsMenu?.destroy();
      this.settingsMenu = undefined;
    });
  }
}
