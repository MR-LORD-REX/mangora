# Third-party software, models, and services

This document records the third-party components that are especially relevant
to Mangora's Android runtime, OCR/translation features, and bundled models. It
is not a complete inventory of every direct or transitive npm dependency.
For the full dependency graph, see `package.json` and `package-lock.json`.
Licenses and upstream terms can change; check the linked sources when
redistributing a build.

## Application license

Mangora's source code is licensed under the GNU Affero General Public License
version 3 (AGPL-3.0-only). See [`LICENSE.txt`](./LICENSE.txt). Third-party
components and model weights remain under their respective licenses; the
application license does not replace those licenses.

## Runtime libraries

| Component | Use in Mangora | License | Source |
| --- | --- | --- | --- |
| Expo and Expo Router | React Native application framework and navigation | MIT | [Expo](https://github.com/expo/expo) |
| React Native and React | Application UI and native app runtime | MIT | [React Native](https://github.com/facebook/react-native), [React](https://github.com/facebook/react) |
| ONNX Runtime React Native | On-device OCR and object-detection inference | MIT | [ONNX Runtime](https://github.com/microsoft/onnxruntime) |
| React Native Skia | Image decoding, processing, and rendering | MIT | [React Native Skia](https://github.com/Shopify/react-native-skia) |
| Drizzle ORM | SQLite schema and database access | Apache-2.0 | [Drizzle ORM](https://github.com/drizzle-team/drizzle-orm) |

## Models

These models are used on-device. The PP-OCR files are downloaded by the app
when a user selects an OCR model; they are not bundled in the APK. The YOLO
ONNX files are bundled in the app.

| Model | Use | License / status | Source |
| --- | --- | --- | --- |
| Manga109 YOLO11 speech-bubble segmentation | Finds speech bubbles and their masks | Apache-2.0, as declared by the published model repository | [Model card and license](https://huggingface.co/huyvux3005/manga109-segmentation-bubble/tree/f9a4108c4955136a810e5e92207972f3fb3a65fd) |
| PP-OCRv6 Medium recognition | Recognizes Japanese, Chinese, and English text | Apache-2.0, as declared by the model repository | [PaddlePaddle model](https://huggingface.co/PaddlePaddle/PP-OCRv6_medium_rec_onnx/tree/50c7eacafc52fa7bcf4194e8cd08e46f8558504b) |
| PP-OCRv5 mobile text detector | Detects text lines for OCR | Apache-2.0, as declared by the model repository | [PaddlePaddle model](https://huggingface.co/PaddlePaddle/PP-OCRv5_mobile_det_onnx/tree/e6f4fa85f00e168c862bc462aebca69eef9b3d3d) |
| PP-OCRv5 Korean mobile recognition | Recognizes Korean and Latin-script text | Apache-2.0, as declared by the model repository | [PaddlePaddle model](https://huggingface.co/PaddlePaddle/korean_PP-OCRv5_mobile_rec_onnx) |
| Mangora YOLO text detector (`assets/models/yolo.onnx`) | Fallback text-region detection | Trained by the Mangora developer using the Ultralytics YOLO framework. | [Ultralytics licensing](https://www.ultralytics.com/license) |

The Manga109 bubble model's publisher lists Manga109 and
[MS92/MangaSegmentation](https://huggingface.co/datasets/MS92/MangaSegmentation)
as training datasets. Dataset/image rights and attribution requirements are
separate from the model repository's Apache-2.0 declaration. Review the
dataset-specific terms before redistributing model weights or images; do not
redistribute Manga109 source images as part of Mangora.

Ultralytics' framework has its own licensing terms. The fact that an ONNX
model was trained or exported using Ultralytics does not, by itself, determine
the license of that model's weights. Confirm the training-data terms for each
model before distribution. The legacy detector was trained by the Mangora
developer; its weight license and training-data provenance should be recorded
before making a more specific licensing claim.

## External services

These are network services, not open-source libraries with an application
software license. Their service terms, availability, and privacy practices
apply when a user chooses to use the corresponding feature.

| Service | Use | Applicable terms |
| --- | --- | --- |
| Google Translate endpoint | Optional free translation of recognized text | [Google Terms of Service](https://policies.google.com/terms). Mangora currently calls Google's `translate.googleapis.com` `gtx` endpoint; this is not an open-source component, and its use is subject to Google's terms and endpoint availability. |
| Google Gemini API | Optional AI translation; recognized text and configured prior-page context may be sent | [Google APIs Terms](https://developers.google.com/terms) and [Gemini API Additional Terms](https://ai.google.dev/gemini-api/terms) |
| Hugging Face Hub | Hosts downloadable OCR model files and the published speech-bubble checkpoint | Hosting does not supply a single license for hosted files. The license for each model is identified separately above. |
| GitHub | Hosts release metadata and APK update assets | GitHub is a hosting service, not the license for the hosted app or assets. |
| User-selected extension repositories and their providers | May supply catalogs, metadata, images, and chapter content | Each repository, extension, and provider has its own terms and content rights. Mangora does not grant rights to third-party content. |

OCR and model inference run on the device. Translation is optional and sends
recognized text to the selected translation provider. Extension requests go
to the services configured by the user.


