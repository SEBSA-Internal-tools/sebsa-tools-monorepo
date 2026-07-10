import {
  Component,
  Input,
  Output,
  EventEmitter,
  ChangeDetectionStrategy,
  forwardRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, NG_VALUE_ACCESSOR, ControlValueAccessor } from '@angular/forms';

export interface TeamMember {
  id: string;
  name: string;
  avatar: string;
}

export interface ProjectFormData {
  name: string;
  description: string;
  teamMembers: TeamMember[];
}

@Component({
  standalone: true,
  selector: 'create-project-modal',
  imports: [CommonModule, FormsModule],
  templateUrl: './create-project-modal.component.html',
  styleUrl: './create-project-modal.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => CreateProjectModalComponent),
      multi: true,
    },
  ],
})
export class CreateProjectModalComponent implements ControlValueAccessor {
  @Input() isOpen = false;
  @Output() close = new EventEmitter<void>();
  @Output() submit = new EventEmitter<ProjectFormData>();

  projectName = '';
  description = '';
  teamMemberSearch = '';
  selectedMembers: TeamMember[] = [];

  availableMembers: TeamMember[] = [
    { id: '1', name: 'Sarah Miller', avatar: 'SM' },
    { id: '2', name: 'James Chen', avatar: 'JC' },
    { id: '3', name: 'Emma Rodriguez', avatar: 'ER' },
    { id: '4', name: 'David Kim', avatar: 'DK' },
    { id: '5', name: 'Lisa Anderson', avatar: 'LA' },
    { id: '6', name: 'Michael Brown', avatar: 'MB' },
  ];

  // ControlValueAccessor methods
  writeValue(obj: any): void {}
  registerOnChange(fn: any): void {}
  registerOnTouched(fn: any): void {}

  getFilteredMembers(): TeamMember[] {
    if (!this.teamMemberSearch.trim()) {
      return this.availableMembers.filter(
        (m) => !this.selectedMembers.find((s) => s.id === m.id)
      );
    }

    return this.availableMembers.filter(
      (m) =>
        m.name.toLowerCase().includes(this.teamMemberSearch.toLowerCase()) &&
        !this.selectedMembers.find((s) => s.id === m.id)
    );
  }

  selectMember(member: TeamMember): void {
    this.selectedMembers = [...this.selectedMembers, member];
    this.teamMemberSearch = '';
  }

  removeMember(memberId: string): void {
    this.selectedMembers = this.selectedMembers.filter((m) => m.id !== memberId);
  }

  onCancel(): void {
    this.resetForm();
    this.close.emit();
  }

  onSubmit(): void {
    if (!this.projectName.trim()) {
      alert('Please enter a project name');
      return;
    }

    const formData: ProjectFormData = {
      name: this.projectName,
      description: this.description,
      teamMembers: this.selectedMembers,
    };

    this.submit.emit(formData);
    this.resetForm();
  }

  private resetForm(): void {
    this.projectName = '';
    this.description = '';
    this.teamMemberSearch = '';
    this.selectedMembers = [];
  }

  onBackdropClick(): void {
    this.onCancel();
  }
}
