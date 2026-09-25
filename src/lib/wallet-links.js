import { normalizePlaceName } from './place-matching.js';

// Deliberately use explicit IDs or exact normalized names, not fuzzy guesses about a ticket.
export function relatedWalletItems(step, items, selections = []) {
  const selection = selections.find(place => place.id === step.selection_id);
  const equal = (a,b) => Boolean(a && b && normalizePlaceName(a) === normalizePlaceName(b));
  return items.filter(item => {
    if (!item.attachments?.length || item.category === 'document') return false;
    if (step.step_type === 'visit' && item.category === 'place') {
      return selection?.trip_item_id === item.id || Boolean(item.place_id && item.place_id === step.place_id) || equal(item.title,step.title) && (!item.date || item.date === step.date);
    }
    if (['arrival','departure'].includes(step.step_type) && item.category === 'flight') {
      if (item.id === `legacy-${step.step_type}`) return true;
      const date = item[`${step.step_type}_datetime`]?.slice(0,10) || item.date;
      return date === step.date && equal(item[`${step.step_type}_airport`],step.location);
    }
    if (item.category === 'stay' && ['transport','access'].includes(step.step_type)) {
      return (!item.date || item.date <= step.date) && (!item.end_date || item.end_date >= step.date) &&
        [step.location,step.route_origin,step.route_destination].some(location => equal(location,item.address) || equal(location,item.title));
    }
    return false;
  });
}
