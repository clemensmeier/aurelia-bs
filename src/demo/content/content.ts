import { autoinject } from 'aurelia-framework';
import { DialogService } from '../../dialog-service';

@autoinject
export class Content {
  dialogCounter = 0;

  constructor(private dialogService: DialogService) {
  }

  showAlert() {
    this.dialogService.alert('Hello', 'World!' + this.dialogCounter++);
  }
}
