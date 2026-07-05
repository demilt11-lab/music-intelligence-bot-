/**
 * Tests for the prediction-evaluation metrics (jobs/etl/evaluate_predictions.ts).
 *
 * The product invariant this guards: precision, recall, and accuracy are
 * *distinct* quantities computed from a real confusion matrix. The previous
 * implementation aliased precision = recall = accuracy, which quietly overstated
 * precision/recall for any detector that wasn't perfectly balanced — a
 * false-precision trap for the label data teams reading these numbers.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeMetrics,
  emptyConfusion,
  tally,
  type ConfusionMatrix,
} from '@/jobs/etl/evaluate_predictions';

function approx(a: number, b: number, eps = 1e-9): void {
  assert.ok(Math.abs(a - b) < eps, `expected ${a} ≈ ${b}`);
}

test('empty confusion matrix yields all-zero metrics (no divide-by-zero)', () => {
  const m = computeMetrics(emptyConfusion());
  assert.deepEqual(m, { accuracy: 0, precision: 0, recall: 0, f1Score: 0 });
});

test('precision, recall and accuracy are genuinely different numbers', () => {
  // A model that flags aggressively: many true positives, some false positives,
  // and a few missed positives. Precision, recall and accuracy must all differ.
  const cm: ConfusionMatrix = { tp: 8, fp: 4, fn: 2, tn: 6 };
  const { accuracy, precision, recall, f1Score } = computeMetrics(cm);

  approx(accuracy, (8 + 6) / 20); // 0.70
  approx(precision, 8 / (8 + 4)); // 0.6667
  approx(recall, 8 / (8 + 2)); // 0.80
  approx(f1Score, (2 * (8 / 12) * 0.8) / (8 / 12 + 0.8));

  assert.notEqual(precision, recall, 'precision must not equal recall here');
  assert.notEqual(precision, accuracy, 'precision must not equal accuracy here');
  assert.notEqual(recall, accuracy, 'recall must not equal accuracy here');
});

test('a high-precision low-recall detector is reported as such, not as one blended number', () => {
  // Flags almost nothing, but is right when it does. Old code would have called
  // this ~0.6 across the board; the confusion matrix exposes the trade-off.
  const cm: ConfusionMatrix = { tp: 2, fp: 0, fn: 40, tn: 58 };
  const { precision, recall, accuracy } = computeMetrics(cm);

  approx(precision, 1); // never wrong when it fires
  approx(recall, 2 / 42); // but misses almost everything real
  approx(accuracy, 60 / 100);
  assert.ok(precision > 0.9 && recall < 0.1, 'precision high, recall low — the point of the fix');
});

test('accuracy stays consistent with correct/total (TP+TN over N)', () => {
  const cm: ConfusionMatrix = { tp: 5, fp: 3, fn: 4, tn: 8 };
  const total = cm.tp + cm.fp + cm.fn + cm.tn;
  const correct = cm.tp + cm.tn;
  approx(computeMetrics(cm).accuracy, correct / total);
});

test('tally routes each (predictedPositive, wasCorrect) pair to the right cell', () => {
  const cm = emptyConfusion();
  tally(cm, true, true); // TP
  tally(cm, true, false); // FP
  tally(cm, false, true); // TN
  tally(cm, false, false); // FN
  tally(cm, true, true); // TP again
  assert.deepEqual(cm, { tp: 2, fp: 1, fn: 1, tn: 1 });
});

test('perfect detector reports 1.0 across the board', () => {
  const cm: ConfusionMatrix = { tp: 10, fp: 0, fn: 0, tn: 10 };
  const { accuracy, precision, recall, f1Score } = computeMetrics(cm);
  approx(accuracy, 1);
  approx(precision, 1);
  approx(recall, 1);
  approx(f1Score, 1);
});
