const { nxE2EPreset } = require('@nx/cypress/plugins/cypress-preset');
const { defineConfig } = require('cypress');
module.exports = defineConfig({
    e2e: {
        ...nxE2EPreset(__filename, {
            "cypressDir": "src",
            "webServerCommands": {
                "default": "npx nx run ipm-fe:serve",
                "production": "npx nx run ipm-fe:serve-static"
            },
            "ciWebServerCommand": "npx nx run ipm-fe:serve-static",
            "ciBaseUrl": "http://localhost:4200"
        }),
        baseUrl: 'http://localhost:4200'
    }
});