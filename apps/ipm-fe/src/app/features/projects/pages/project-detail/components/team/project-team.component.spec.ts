import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, Subject, throwError } from 'rxjs';
import type { PrivilegeGroup, ProjectRole } from '@sebsa-pm-tool/shared-models';
import { ProjectsService } from '../../../../services/projects.service';
import { PrivilegeGroupsService } from '../../../../../../core/services/privilege-groups.service';
import { ProjectTeamComponent } from './project-team.component';

describe('ProjectTeamComponent', () => {
  let fixture: ComponentFixture<ProjectTeamComponent>;
  let component: ProjectTeamComponent;
  let projectsService: {
    getMembers: jest.Mock;
    getRoles: jest.Mock;
    createRole: jest.Mock;
  };
  let privilegeGroupsService: { list: jest.Mock };

  const group = {
    id: '2b486af4-ecaa-49c2-b5cb-a25745afdc5f',
    name: 'Member Access',
  } as PrivilegeGroup;

  beforeEach(async () => {
    projectsService = {
      getMembers: jest.fn().mockReturnValue(of([])),
      getRoles: jest.fn().mockReturnValue(of([])),
      createRole: jest.fn(),
    };
    privilegeGroupsService = { list: jest.fn().mockReturnValue(of([group])) };

    await TestBed.configureTestingModule({
      imports: [ProjectTeamComponent],
      providers: [
        { provide: ProjectsService, useValue: projectsService },
        { provide: PrivilegeGroupsService, useValue: privilegeGroupsService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ProjectTeamComponent);
    component = fixture.componentInstance;
    component.projectId = 'project-1';
    fixture.detectChanges();
  });

  it('explains why a role cannot be created when required values are missing', () => {
    component.createRole();

    expect(component.rolesErrorMessage()).toBe('Enter a name for the custom role.');
    expect(projectsService.createRole).not.toHaveBeenCalled();

    component.newRoleName = 'Reviewer';
    component.createRole();

    expect(component.rolesErrorMessage()).toBe(
      'Select a privilege group for the custom role.',
    );
    expect(projectsService.createRole).not.toHaveBeenCalled();
  });

  it('creates a trimmed custom role and immediately adds the response to the list', () => {
    const createdRole = {
      id: 'role-1',
      projectId: 'project-1',
      name: 'Reviewer',
      isSystemDefault: false,
      privilegeGroup: group,
    } as ProjectRole;
    projectsService.createRole.mockReturnValue(of(createdRole));
    component.newRoleName = '  Reviewer  ';
    component.newRoleGroupId = group.id;

    component.createRole();

    expect(projectsService.createRole).toHaveBeenCalledWith('project-1', {
      name: 'Reviewer',
      privilegeGroupId: group.id,
    });
    expect(component.roles()).toEqual([createdRole]);
    expect(component.newRoleName).toBe('');
    expect(component.newRoleGroupId).toBe('');
    expect(component.isCreatingRole()).toBe(false);
  });

  it('prevents duplicate submissions while a request is in progress', () => {
    const response = new Subject<ProjectRole>();
    projectsService.createRole.mockReturnValue(response);
    component.newRoleName = 'Reviewer';
    component.newRoleGroupId = group.id;

    component.createRole();
    component.createRole();

    expect(projectsService.createRole).toHaveBeenCalledTimes(1);
    expect(component.isCreatingRole()).toBe(true);
  });

  it('shows backend validation messages and restores the button', () => {
    projectsService.createRole.mockReturnValue(
      throwError(() => ({ error: { message: ['Name is already in use.'] } })),
    );
    component.newRoleName = 'Reviewer';
    component.newRoleGroupId = group.id;

    component.createRole();

    expect(component.rolesErrorMessage()).toBe('Name is already in use.');
    expect(component.isCreatingRole()).toBe(false);
  });
});
