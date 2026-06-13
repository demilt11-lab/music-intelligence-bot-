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
  accuracy: number;
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

/** Train a multinomial logistic regression on labelled examples. */
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

  // Z-score normalisation
  const normMean = Array.from({ length: nFeatures }, (_, j) => {
    const s = X.reduce((acc, row) => acc + row[j], 0);
    return s / nSamples;
  });
  const normStd = Array.from({ length: nFeatures }, (_, j) => {
    const mean = normMean[j];
    const variance = X.reduce((acc, row) => acc + (row[j] - mean) ** 2, 0) / nSamples;
    return Math.sqrt(variance) || 1;
  });
  const Xn: number[][] = X.map((row) => normalise(row, normMean, normStd));

  // Weight initialisation (Xavier)
  const scale = Math.sqrt(2 / (nFeatures + nClasses));
  let W: number[][] = Array.from({ length: nClasses }, () =>
    Array.from({ length: nFeatures }, () => (Math.random() * 2 - 1) * scale),
  );
  let b: number[] = new Array(nClasses).fill(0);

  // Adam state
  let mW = W.map((r) => r.map(() => 0));
  let vW = W.map((r) => r.map(() => 0));
  let mb = b.map(() => 0);
  let vb = b.map(() => 0);
  const beta1 = 0.9, beta2 = 0.999, eps = 1e-8;
  let t = 0;

  const idx = Array.from({ length: nSamples }, (_, i) => i);

  for (let epoch = 0; epoch < epochs; epoch++) {
    // Fisher-Yates shuffle
    for (let i = idx.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [idx[i], idx[j]] = [idx[j], idx[i]];
    }

    for (let bStart = 0; bStart < nSamples; bStart += batchSize) {
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

  // Training accuracy
  let correct = 0;
  for (let i = 0; i < nSamples; i++) {
    const logits = W.map((row, k) => row.reduce((s, w, j) => s + w * Xn[i][j], 0) + b[k]);
    const probs = softmax(logits);
    if (probs.indexOf(Math.max(...probs)) === y[i]) correct++;
  }

  return {
    weights: { W, b },
    classes,
    featureNames,
    normMean,
    normStd,
    trainedAt: new Date().toISOString(),
    nSamples,
    accuracy: correct / nSamples,
  };
}
