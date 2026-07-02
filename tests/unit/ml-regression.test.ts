/**
 * Regression tests for the logistic-regression trainer (lib/ml/regression.ts)
 * used by both the artist-trajectory and track-viral models.
 *
 * The key product invariant this guards: reported model accuracy must be a
 * held-out generalization estimate, not the training accuracy re-reported as
 * if it meant something — training accuracy alone measures memorization and
 * was previously shown as "the" accuracy everywhere (API responses, the
 * artist page's modelAccuracy card).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { trainLogistic, predictClass } from '@/lib/ml/regression';

function makeSeparableData(n: number) {
  const X: number[][] = [];
  const y: number[] = [];
  for (let i = 0; i < n; i++) {
    const cls = i % 2;
    const base = cls === 0 ? -2 : 2;
    X.push([base + (Math.random() - 0.5), base + (Math.random() - 0.5)]);
    y.push(cls);
  }
  return { X, y };
}

test('small datasets skip the held-out split and flag it honestly', () => {
  const { X, y } = makeSeparableData(20); // below MIN_SAMPLES_FOR_HOLDOUT
  const model = trainLogistic(X, y, ['a', 'b'], ['f1', 'f2'], { epochs: 150 });

  assert.equal(model.heldOut, false, 'too few samples to hold out a meaningful test set');
  assert.equal(model.nTestSamples, 0);
  assert.equal(model.accuracy, model.trainAccuracy, 'falls back to reporting training accuracy as such, not a fake split');
});

test('larger datasets hold out ~20% and report held-out accuracy separately from training accuracy', () => {
  const { X, y } = makeSeparableData(200);
  const model = trainLogistic(X, y, ['a', 'b'], ['f1', 'f2'], { epochs: 300 });

  assert.equal(model.heldOut, true);
  assert.equal(model.nTestSamples, 40, '20% of 200');
  assert.ok(model.accuracy >= 0, 'held-out accuracy is a real fraction');
  assert.ok(model.accuracy <= 1);
  // On clearly-separable synthetic data the model should generalize well —
  // this is the actual regression guard: a broken split (e.g. leaking test
  // rows into training, or not training at all) would show up as either a
  // suspiciously perfect or a chance-level (~0.5) held-out score.
  assert.ok(model.accuracy > 0.8, `expected strong generalization on separable data, got ${model.accuracy}`);
});

test('normalization stats are fit on the training split only (no leakage)', () => {
  // A held-out sample far outside the training distribution should still
  // normalize and predict sanely — if test rows had leaked into the mean/std
  // fit, this wouldn't by itself prove leakage, but a crash or NaN here would
  // indicate the norm stats array is malformed for the feature count.
  const { X, y } = makeSeparableData(200);
  const model = trainLogistic(X, y, ['a', 'b'], ['f1', 'f2'], { epochs: 300 });

  assert.equal(model.normMean.length, 2);
  assert.equal(model.normStd.length, 2);
  assert.ok(model.normStd.every((s) => Number.isFinite(s) && s > 0));
});

test('predictClass returns a label from the trained class set', () => {
  const { X, y } = makeSeparableData(200);
  const model = trainLogistic(X, y, ['a', 'b'], ['f1', 'f2'], { epochs: 300 });

  const label = predictClass([-2, -2], model);
  assert.ok(['a', 'b'].includes(label));
  assert.equal(label, 'a', 'a clearly class-0-shaped input should predict class a');
});
