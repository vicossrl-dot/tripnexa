export const TRAVEL_TYPES = [
  { value: 'plane', label: 'Plane', image: '/media/travel/plane.svg' },
  { value: 'car', label: 'Car', image: '/media/travel/car.svg' },
  { value: 'train', label: 'Train', image: '/media/travel/train.svg' },
  { value: 'ship', label: 'Ship', image: '/media/travel/ship.svg' },
  { value: 'bus', label: 'Bus', image: '/media/travel/bus.svg' },
  { value: 'mixed', label: 'Mixed / Other', image: '/media/travel/mixed.svg' },
];
export function travelBackground(type) {
  return TRAVEL_TYPES.find(item => item.value === type)?.image || '/media/travel/default.svg';
}
export function travelLabel(type) {
  return TRAVEL_TYPES.find(item => item.value === type)?.label || 'Not selected';
}
