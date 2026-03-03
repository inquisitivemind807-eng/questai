const fs = require('fs');
const config = JSON.parse(fs.readFileSync('src/bots/user-bots-config.json', 'utf8'));
config.formData.botMode = 'manual';
fs.writeFileSync('src/bots/user-bots-config.json', JSON.stringify(config, null, 2));
console.log("Updated config to manual mode via script");
