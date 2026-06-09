import { setOnTitleUpdate }               from './chat.js';
import { updateSessionTitle, initSidebar } from './sidebar.js';
import { initModelDropdown }               from './settings.js';
import './voice.js';
import './docs.js';
import './settings.js';

setOnTitleUpdate(updateSessionTitle);

initSidebar();
initModelDropdown();
