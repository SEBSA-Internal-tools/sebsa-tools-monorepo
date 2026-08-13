import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnChanges,
  SimpleChanges,
  ChangeDetectionStrategy,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { UsersService } from '../../../../../core/services/users.service';
import type {
  Project,
  ProjectType,
  UserSummary,
} from '@sebsa-pm-tool/shared-models';

export interface ProjectFormData {
  name: string;
  description: string;
  type: ProjectType;
  customType?: string;
  memberIds: string[];
  isCsoProject: boolean;
  customerName?: string;
}

const PROJECT_TYPE_OPTIONS: { value: ProjectType; label: string }[] = [
  { value: 'IFS_IMPLEMENTATION', label: 'IFS Implementation' },
  { value: 'IFS_SUPPORT', label: 'IFS Support' },
  { value: 'INTERNAL', label: 'Internal' },
  { value: 'CUSTOMIZATION', label: 'Customization' },
  { value: 'UPGRADE', label: 'Upgrade' },
  { value: 'CONFIGURATION', label: 'Configuration' },
  { value: 'CUSTOM', label: 'Custom' },
];

@Component({
  standalone: true,
  selector: 'create-project-modal',
  imports: [CommonModule, FormsModule],
  templateUrl: './create-project-modal.component.html',
  styleUrl: './create-project-modal.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CreateProjectModalComponent implements OnChanges {
  private readonly usersService = inject(UsersService);

  @Input() isOpen = false;
  @Input() editingProject: Project | null = null;
  /** When true and not editing an existing project, the CSO checkbox
   *  starts checked — used when this modal is opened from the CSO
   *  Dashboard's "New CSO Project" entry point. */
  @Input() defaultCsoProject = false;
  @Output() closed = new EventEmitter<void>();
  @Output() submitted = new EventEmitter<ProjectFormData>();

  protected readonly typeOptions = PROJECT_TYPE_OPTIONS;

  projectName = '';
  description = '';
  type: ProjectType | '' = '';
  customType = '';
  teamMemberSearch = '';
  selectedMembers: UserSummary[] = [];
  isCsoProject = false;
  customerName = '';

  protected readonly availableMembers = signal<UserSummary[]>([]);
  protected readonly isEditMode = signal(false);

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['isOpen'] && this.isOpen) {
      this.isEditMode.set(!!this.editingProject);
      this.prefillForm();
      this.loadAvailableMembers();
    }
  }

  private prefillForm(): void {
    if (this.editingProject) {
      this.projectName = this.editingProject.name;
      this.description = this.editingProject.description ?? '';
      this.type = this.editingProject.type;
      this.customType = this.editingProject.customType ?? '';
      this.isCsoProject = this.editingProject.isCsoProject;
      this.customerName = this.editingProject.customerName ?? '';
    } else {
      this.resetForm();
      this.isCsoProject = this.defaultCsoProject;
    }
  }

  private loadAvailableMembers(): void {
    this.usersService.search('').subscribe({
      next: (users) => this.availableMembers.set(users),
      error: () => this.availableMembers.set([]),
    });
  }

  getFilteredMembers(): UserSummary[] {
    const term = this.teamMemberSearch.trim().toLowerCase();
    return this.availableMembers().filter(
      (candidate) =>
        !this.selectedMembers.find((s) => s.id === candidate.id) &&
        (!term || candidate.name.toLowerCase().includes(term)),
    );
  }

  selectMember(member: UserSummary): void {
    this.selectedMembers = [...this.selectedMembers, member];
    this.teamMemberSearch = '';
  }

  removeMember(memberId: string): void {
    this.selectedMembers = this.selectedMembers.filter((m) => m.id !== memberId);
  }

  initials(name: string): string {
    return name
      .split(' ')
      .map((part) => part[0])
      .join('')
      .toUpperCase();
  }

  onCancel(): void {
    this.resetForm();
    this.closed.emit();
  }

  onSubmit(): void {
    if (!this.projectName.trim()) {
      alert('Please enter a project name');
      return;
    }
    if (!this.type) {
      alert('Please select a project type');
      return;
    }
    if (this.type === 'CUSTOM' && !this.customType.trim()) {
      alert('Please enter a name for the custom project type');
      return;
    }
    if (this.isCsoProject && !this.customerName.trim()) {
      alert('Please enter a customer name for this CSO project');
      return;
    }

    const formData: ProjectFormData = {
      name: this.projectName,
      description: this.description,
      type: this.type,
      customType: this.type === 'CUSTOM' ? this.customType : undefined,
      memberIds: this.selectedMembers.map((m) => m.id),
      isCsoProject: this.isCsoProject,
      customerName: this.isCsoProject ? this.customerName.trim() : undefined,
    };

    this.submitted.emit(formData);
    this.resetForm();
    this.closed.emit();
  }

  private resetForm(): void {
    this.projectName = '';
    this.description = '';
    this.type = '';
    this.customType = '';
    this.teamMemberSearch = '';
    this.selectedMembers = [];
    this.isCsoProject = false;
    this.customerName = '';
  }

  onBackdropClick(): void {
    this.onCancel();
  }
}
