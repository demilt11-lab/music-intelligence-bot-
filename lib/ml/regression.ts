/**
 * Multinomial logistic regression (softmax) trained via mini-batch gradient
 * descent with the Adam optimiser. Pure TypeScript — no native deps, no Python,
 * runs comfortably within a 60-second Vercel Function.
 *
 * Also exports a binary-class convenience wrapper (logistic sigmoid).
 */

export type ModelWeights = {
  W: number[][];  // [nClasses][nFeatures]
  b: number[];    // [nClasses]
};

export type TrainedModel = {
  weights: ModelWeights;
  classes: string[];
  featureNames: string[];
  normMean: number[];
  normStd: number[];
  trainedAt: string;
  nSamples: number;
  /**
   * Accuracy on a held-out split never seen during training — the honest
   * generalization estimate. Falls back to training accuracy (heldOut:
   * false) when there isn't enough data to hold out a meaningful test set,
   * rather than reporting a 1-2 sample "accuracy" as if it were reliable.
   */
  accuracy: number;
  trainAccuracy: number;
  heldOut: boolean;
  nTestSamples: number;
};

function softmax(logits: number[]): number[] {
  const max = Math.max(...logits);
  const exp = logits.map((l) => Math.exp(l - max));
  const sum = exp.reduce((a, b) => a + b, 0);
  return exp.map((e) => e / sum);
}

/** Normalise a raw feature vector using stored mean/std from a trained model. */
export function normalise(x: number[], mean: number[], std: number[]): number[] {
  return x.map((v, i) => (v - mean[i]) / (std[i] || 1));
}

/** Class probability vector for a single example. */
export function predictProba(features: number[], model: TrainedModel): number[] {
  const x = normalise(features, model.normMean, model.normStd);
  const { W, b } = model.weights;
  const logits = W.map((row, k) => row.reduce((s, w, j) => s + w * x[j], 0) + b[k]);
  return softmax(logits);
}

/** Predicted class label for a single example. */
export function predictClass(features: number[], model: TrainedModel): string {
  const probs = predictProba(features, model);
  return model.classes[probs.indexOf(Math.max(...probs))];
}

// Below this total, a 20% held-out split would leave too few test samples
// for the resulting "accuracy" to mean anything (e.g. 2-3 samples) — fall
// back to reporting training accuracy, clearly flagged as such, rather than
// a noisy point estimate dressed up as a real evaluation.
const MIN_SAMPLES_FOR_HOLDOUT = 30;
const TEST_SPLIT = 0.2;

function accuracyOn(
  indices: number[],
  Xn: number[][],
  y: number[],
  W: number[][],
  b: number[],
): number {
  if (indices.length === 0) return 0;
  let correct = 0;
  for (const i of indices) {
    const logits = W.map((row, k) => row.reduce((s, w, j) => s + w * Xn[i][j], 0) + b[k]);
    const probs = softmax(logits);
    if (probs.indexOf(Math.max(...probs)) === y[i]) correct++;
  }
  return correct / indices.length;
}

/**
 * Train a multinomial logistic regression on labelled examples. Holds out a
 * test split (never seen during training) when there's enough data, and
 * reports accuracy on that split rather than on the training data itself —
 * training accuracy alone measures memorization, not generalization.
 */
export function trainLogistic(
  X: number[][],
  y: number[],
  classes: string[],
  featureNames: string[],
  opts: { epochs?: number; lr?: number; batchSize?: number; l2?: number } = {},
): TrainedModel {
  const nSamples = X.length;
  const nFeatures = X[0].length;
  const nClasses = classes.length;
  const { epochs = 600, lr = 0.005, batchSize = 128, l2 = 1e-4 } = opts;

  // Split once, up front — the same split is used for every epoch, and
  // normalization stats are fit on the train portion only so no information
  // from the test set leaks into training (via the mean/std used to scale
  // features).
  const heldOut = nSamples >= MIN_SAMPLES_FOR_HOLDOUT;
  const allIdx = Array.from({ length: nSamples }, (_, i) => i);
  for (let i = allIdx.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [allIdx[i], allIdx[j]] = [allIdx[j], allIdx[i]];
  }
  const nTest = heldOut ? Math.max(1, Math.round(nSamples * TEST_SPLIT)) : 0;
  const testIdx = allIdx.slice(0, nTest);
  const trainIdx = heldOut ? allIdx.slice(nTest) : allIdx;

  // Z-score normalisation, fit on the training portion only
  const normMean = Array.from({ length: nFeatures }, (_, j) => {
    const s = trainIdx.reduce((acc, i) => acc + X[i][j], 0);
    return s / trainIdx.length;
  });
  const normStd = Array.from({ length: nFeatures }, (_, j) => {
    const mean = normMean[j];
    const variance = trainIdx.reduce((acc, i) => acc + (X[i][j] - mean) ** 2, 0) / trainIdx.length;
    return Math.sqrt(variance) || 1;
  });
  const Xn: number[][] = X.map((row) => normalise(row, normMean, normStd));

  // Weight initialisation (Xavier)
  const scale = Math.sqrt(2 / (nFeatures + nClasses));
  const W: number[][] = Array.from({ length: nClasses }, () =>
    Array.from({ length: nFeatures }, () => (Math.random() * 2 - 1) * scale),
  );
  const b: number[] = new Array(nClasses).fill(0);

  // Adam state
  const mW = W.map((r) => r.map(() => 0));
  const vW = W.map((r) => r.map(() => 0));
  const mb = b.map(() => 0);
  const vb = b.map(() => 0);
  const beta1 = 0.9, beta2 = 0.999, eps = 1e-8;
  let t = 0;

  const idx = [...trainIdx];
  const nTrain = idx.length;

  for (let epoch = 0; epoch < epochs; epoch++) {
    // Fisher-Yates shuffle (training indices only — test set never enters
    // the loop below)
    for (let i = idx.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [idx[i], idx[j]] = [idx[j], idx[i]];
    }

    for (let bStart = 0; bStart < nTrain; bStart += batchSize) {
      t++;
      const batch = idx.slice(bStart, bStart + batchSize);
      const bSize = batch.length;

      const dW: number[][] = Array.from({ length: nClasses }, () => new Array(nFeatures).fill(0));
      const db_: number[] = new Array(nClasses).fill(0);

      for (const i of batch) {
        const logits = W.map((row, k) => row.reduce((s, w, j) => s + w * Xn[i][j], 0) + b[k]);
        const probs = softmax(logits);
        for (let k = 0; k < nClasses; k++) {
          const err = (probs[k] - (y[i] === k ? 1 : 0)) / bSize;
          for (let j = 0; j < nFeatures; j++) dW[k][j] += err * Xn[i][j];
          db_[k] += err;
        }
      }

      // Adam update with L2 regularisation on W
      for (let k = 0; k < nClasses; k++) {
        for (let j = 0; j < nFeatures; j++) {
          const g = dW[k][j] + l2 * W[k][j];
          mW[k][j] = beta1 * mW[k][j] + (1 - beta1) * g;
          vW[k][j] = beta2 * vW[k][j] + (1 - beta2) * g * g;
          W[k][j] -= (lr * (mW[k][j] / (1 - beta1 ** t))) / (Math.sqrt(vW[k][j] / (1 - beta2 ** t)) + eps);
        }
        mb[k] = beta1 * mb[k] + (1 - beta1) * db_[k];
        vb[k] = beta2 * vb[k] + (1 - beta2) * db_[k] * db_[k];
        b[k] -= (lr * (mb[k] / (1 - beta1 ** t))) / (Math.sqrt(vb[k] / (1 - beta2 ** t)) + eps);
      }
    }
  }

  const trainAccuracy = accuracyOn(trainIdx, Xn, y, W, b);
  const testAccuracy = heldOut ? accuracyOn(testIdx, Xn, y, W, b) : trainAccuracy;

  return {
    weights: { W, b },
    classes,
    featureNames,
    normMean,
    normStd,
    trainedAt: new Date().toISOString(),
    nSamples,
    accuracy: testAccuracy,
    trainAccuracy,
    heldOut,
    nTestSamples: testIdx.length,
  };
}
