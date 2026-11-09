const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');

function transpile(path) {
  return ts.transpileModule(fs.readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
}

function loadModule(path, dependencies = {}) {
  const module = { exports: {} };
  const localRequire = (id) => {
    if (id in dependencies) return dependencies[id];
    throw new Error(`Unexpected dependency in pure recommendation test: ${id}`);
  };
  new Function('require', 'module', 'exports', transpile(path))(localRequire, module, module.exports);
  return module.exports;
}

const projectDescription = loadModule('lib/projectDescription.ts');
const { normalizeSkill, recommendCvContent } = loadModule('lib/cv-recommendations.ts', {
  '@/lib/projectDescription': projectDescription,
});

const employee = {
  rowId: '00000000-0000-4000-8000-000000000001',
  summary: 'Software engineer focused on reliable delivery.',
  cvAcademic: [],
  cvExperience: [
    {
      position: 'Senior Software Engineer',
      company: 'Example Co',
      period: '2022 - Present',
      tasks: [
        'Built REST APIs with Node.js and PostgreSQL.',
        'Organized the annual company sports day.',
      ],
    },
  ],
  specialProjects: [
    {
      title: 'Customer Portal',
      brief: 'Developed React user interfaces.\nDeployed services to Amazon Web Services.',
      skills: ['React.js', 'AWS'],
    },
    {
      title: 'Office Event',
      brief: 'Coordinated catering and venue logistics.',
      skills: [],
    },
  ],
  cvCertifications: [],
};

test('normalizes common technology aliases', () => {
  assert.equal(normalizeSkill('React.js'), 'react');
  assert.equal(normalizeSkill('Amazon Web Services'), 'aws');
  assert.equal(normalizeSkill('C Sharp'), 'c#');
});

test('ranks only real profile content and scores individual work points', () => {
  const result = recommendCvContent(
    employee,
    'React, AWS, NodeJS, PostgreSQL',
    'Build customer-facing REST services and deploy reliable cloud applications.'
  );

  assert.equal(result.objective, employee.summary);
  assert.equal(result.projects[0].rank, 1);
  assert.equal(result.projects[0].relevant, true);
  assert.equal(result.projects[1].relevant, false);
  assert.equal(result.experience[0].tasks[0].relevant, true);
  assert.equal(result.experience[0].tasks[1].relevant, false);
  assert.deepEqual(
    result.projects[0].descriptionPoints.map((point) => point.text),
    ['Deployed services to Amazon Web Services.', 'Developed React user interfaces.']
  );
  assert.deepEqual(result.projects[0].descriptionPoints.map((point) => point.rank), [1, 2]);

  const returnedText = JSON.stringify(result);
  assert.match(returnedText, /Customer Portal/);
  assert.doesNotMatch(returnedText, /invented achievement/i);
});

test('returns no recommendations when requirements have no profile match', () => {
  const result = recommendCvContent(employee, 'Kubernetes', 'Terraform infrastructure');
  assert.ok(result.projects.every((project) => !project.relevant));
  assert.ok(result.experience.every((experience) => !experience.relevant));
});
