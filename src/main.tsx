import './testlab/boot'; // TEMPORARY Test Lab (docs/TEST_LAB.md): must run before every other game module
import { createRoot } from 'react-dom/client';
import { App } from './ui/App';
import { registerOfflineCache } from './platform/serviceWorker';
import './ui/styles.css';

createRoot(document.getElementById('root')!).render(<App />);

registerOfflineCache();
