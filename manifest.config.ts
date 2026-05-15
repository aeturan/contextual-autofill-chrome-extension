import { defineManifest } from '@crxjs/vite-plugin'

export default defineManifest({
    manifest_version: 3,
    name: "Contextual Autofill",
    version: "1.0.0",

    // 1. Tell Chrome to inject our spy script into every website
    content_scripts: [
        {
            matches: ["<all_urls>"],
            js: ["src/content/index.tsx"]
        }
    ],

    background: {
        service_worker: "src/background/index.ts",
        type: "module"
    },

    options_ui: {
        page: "src/options/index.html",
        open_in_tab: true
    },

    // 2. Ask for permission to use the local hard drive
    permissions: [
        "storage"
    ]
})