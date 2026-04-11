import { setOnTitleUpdate }          from './modules/chat.js';
import { updateSessionTitle, initSidebar } from './modules/sidebar.js';
import './modules/voice.js';
import './modules/docs.js';
import './modules/settings.js';

setOnTitleUpdate(updateSessionTitle);

initSidebar();
