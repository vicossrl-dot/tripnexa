import en from './server-locales/en.json' with {type:'json'};
import ro from './server-locales/ro.json' with {type:'json'};
import ru from './server-locales/ru.json' with {type:'json'};
import de from './server-locales/de.json' with {type:'json'};
import fr from './server-locales/fr.json' with {type:'json'};
import es from './server-locales/es.json' with {type:'json'};
export const extraServerCatalogs={en,ro,ru,de,fr,es};
export const extraMessageRows=Object.entries(en).map(([key,text])=>[key,text,ro[key],ru[key],de[key],fr[key],es[key]]);
