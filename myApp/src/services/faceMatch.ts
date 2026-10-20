/**
 * Face matching in the browser, with @vladmandic/face-api.
 *
 * Everything runs on the staff member's device: the models load from
 * /models/face (copied from the package into public/), and no photo is sent
 * to any outside service. The API only stores the photo and its 128 number
 * signature (the descriptor) once the customer has consented.
 *
 * A match is a hint for staff, not a decision. ID photos are small, old, and
 * printed, so a real match can still come back "unsure".
 */
import * as faceapi from '@vladmandic/face-api';

const MODEL_URL = `${import.meta.env.BASE_URL}models/face`;

/**
 * Distance thresholds between two descriptors (lower is closer). face-api's
 * own rule of thumb is 0.6 for "same person"; these are stricter, because a
 * wrong "match" at the counter costs more than a second look at an ID.
 */
export const MATCH_DISTANCE = 0.45;
export const UNSURE_DISTANCE = 0.55;

export type FaceVerdict = 'match' | 'unsure' | 'no_match';

let modelsReady: Promise<void> | null = null;

/** Load the three models once; later calls share the same promise. */
export function loadFaceModels(): Promise<void> {
    if (!modelsReady) {
        modelsReady = Promise.all([
            faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
            faceapi.nets.faceLandmark68TinyNet.loadFromUri(MODEL_URL),
            faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
        ]).then(() => undefined).catch((error) => {
            // Let a later attempt try again, for instance after the network returns.
            modelsReady = null;
            throw error;
        });
    }
    return modelsReady;
}

export type FaceReading =
    | { kind: 'none' }
    | { kind: 'many'; count: number }
    | { kind: 'one'; descriptor: Float32Array; box: { x: number; y: number; width: number; height: number } };

const detectorOptions = (inputSize: number) => new faceapi.TinyFaceDetectorOptions({ inputSize, scoreThreshold: 0.5 });

/** Detector grid sizes, most likely first. Each must be a multiple of 32. */
const DETECT_SIZES = [416, 320, 512, 608];

const detectWithDescriptors = (input: HTMLImageElement | HTMLCanvasElement | HTMLVideoElement, size: number) =>
    faceapi.detectAllFaces(input, detectorOptions(size)).withFaceLandmarks(true).withFaceDescriptors();

/**
 * Find the face in a photo and work out its descriptor.
 *
 * A live photo of the person at the counter must show exactly one face. An ID
 * photo often has a second, ghost image of the face printed on the card, so
 * for an ID (`largestOnly`) the biggest face is taken and the rest ignored.
 */
export async function readFace(input: HTMLImageElement | HTMLCanvasElement | HTMLVideoElement, largestOnly = false): Promise<FaceReading> {
    await loadFaceModels();
    // The tiny detector finds a face only at some scales: a face filling the
    // frame (a webcam close up, a cropped ID) is missed at a fine grid, and a
    // small face in a wide shot at a coarse one. Try the sizes in turn and
    // keep the first that finds anything.
    let faces: Awaited<ReturnType<typeof detectWithDescriptors>> = [];
    for (const size of DETECT_SIZES) {
        faces = await detectWithDescriptors(input, size);
        if (faces.length > 0) break;
    }

    if (faces.length === 0) return { kind: 'none' };
    if (faces.length > 1 && !largestOnly) return { kind: 'many', count: faces.length };

    const face = faces.reduce((best, next) => (next.detection.box.area > best.detection.box.area ? next : best));
    const { x, y, width, height } = face.detection.box;
    return { kind: 'one', descriptor: face.descriptor, box: { x, y, width, height } };
}

/** Count the faces in a live video frame, for the "look at the camera" hint. Cheap: no descriptor. */
export async function countFaces(video: HTMLVideoElement): Promise<number> {
    await loadFaceModels();
    // Two quick sizes cover a face close up and one further back.
    for (const size of [320, 416]) {
        const found = (await faceapi.detectAllFaces(video, detectorOptions(size))).length;
        if (found > 0) return found;
    }
    return 0;
}

export const faceDistance = (a: ArrayLike<number>, b: ArrayLike<number>) =>
    faceapi.euclideanDistance(Array.from(a), Array.from(b));

export const verdictFor = (distance: number): FaceVerdict =>
    distance <= MATCH_DISTANCE ? 'match' : distance <= UNSURE_DISTANCE ? 'unsure' : 'no_match';

/** Load an image (a data URL or a path) so the detector can read it. */
export function loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error('The photo could not be opened.'));
        image.src = src;
    });
}
