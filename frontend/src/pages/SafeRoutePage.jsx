import React from 'react';
import SafeRoute from '../components/SafeRoute';
import { useLocations } from '../hooks/useLocations';
import { getCurrentSlot } from '../utils/helpers';

export default function SafeRoutePage() {
  const { slot } = useLocations();
  return <SafeRoute slot={slot || getCurrentSlot()} />;
}
