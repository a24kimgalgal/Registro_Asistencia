export function isPositiveId(value) {
  return typeof value === 'string' && /^[1-9]\d*$/.test(value);
}

export function isValidDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function isValidTime(value) {
  if (typeof value !== 'string' || !/^\d{2}:\d{2}(:\d{2})?$/.test(value)) {
    return false;
  }

  const [hours, minutes, seconds = '00'] = value.split(':').map(Number);
  return hours < 24 && minutes < 60 && seconds < 60;
}

export function timeInSeconds(value) {
  if (!isValidTime(value)) {
    return null;
  }
  const [hours, minutes, seconds = '00'] = value.split(':').map(Number);
  return hours * 3600 + minutes * 60 + seconds;
}

export function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

export function isOptionalString(value) {
  return value === null || value === undefined || typeof value === 'string';
}
