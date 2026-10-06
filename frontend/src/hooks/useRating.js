import { useState, useCallback } from 'react';
import { ratingsApi } from '../utils/api';
import { computeRawSTI, categorizeSTI, getCurrentSlot } from '../utils/helpers';

const DEFAULT_FACTORS = {
  lighting: 5,
  crowdBehavior: 5,
  policeVisibility: 5,
  incidentWeight: 3,
};

export function useRating({ onSuccess } = {}) {
  const [factors, setFactors]     = useState(DEFAULT_FACTORS);
  const [timeSlot, setTimeSlot]   = useState(getCurrentSlot());
  const [comment, setComment]     = useState('');
  const [tags, setTags]           = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]         = useState(null);
  const [submitted, setSubmitted] = useState(false);

  // Live STI preview
  const previewSTI  = computeRawSTI(factors);
  const previewCat  = categorizeSTI(previewSTI);

  const setFactor = useCallback((key, value) => {
    setFactors(prev => ({ ...prev, [key]: Number(value) }));
  }, []);

  const toggleTag = useCallback((tag) => {
    setTags(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag].slice(0, 5)
    );
  }, []);

  const reset = useCallback(() => {
    setFactors(DEFAULT_FACTORS);
    setTimeSlot(getCurrentSlot());
    setComment('');
    setTags([]);
    setError(null);
    setSubmitted(false);
  }, []);

  const submit = useCallback(async (locationId) => {
    if (!locationId) { setError('Please select a location first.'); return false; }
    setSubmitting(true);
    setError(null);
    try {
      const res = await ratingsApi.submit({
        locationId,
        timeSlot,
        ...factors,
        comment,
        tags,
      });
      setSubmitted(true);
      onSuccess?.(res.data);
      return true;
    } catch (err) {
      const msg = err.response?.data?.error || 'Submission failed. Please try again.';
      setError(msg);
      return false;
    } finally {
      setSubmitting(false);
    }
  }, [timeSlot, factors, comment, tags, onSuccess]);

  return {
    factors, setFactor,
    timeSlot, setTimeSlot,
    comment, setComment,
    tags, toggleTag,
    previewSTI, previewCat,
    submitting, error, submitted,
    submit, reset,
  };
}
