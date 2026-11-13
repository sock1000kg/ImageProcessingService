# Datasets and what we may do with them

Every dataset the project uses, plans to use, or ruled out, with the usage terms **as checked on 2026-11-12**. "Checked" means I read the
source named in the Terms column; "not verified" means I could not reach or read it, so do not rely on the entry. The project is
non-commercial (school, open source). This is a record of what the sources say, not legal advice. The images of every dataset stay out of git
(`datasets/`, `images*/` are gitignored); only our own labels and scripts are committed.

| Dataset | Used for | Terms (source) | Status |
| --- | --- | --- | --- |
| **WIDER FACE** (train + val) | Face detector training (`wider-face-yolo.zip`); benchmark: 3,226 val images | CC BY-NC-ND 4.0 ([Hugging Face dataset card](https://huggingface.co/datasets/CUHK-CSE/wider_face)). Non-commercial fits. **ND (no derivatives):** the YOLO-format zip shared on the team Drive / Kaggle and the models trained on it may count as derivatives, so ask a lecturer before publishing either | Used |
| **UET plates** (`ng-d-ng-may-tinh-K62-UET-M1/yolo-dataset`) | Plate detection benchmark (`infra/bench/dataset`), 80 hand-read plate texts (`ocr/uet-plates-text.json`) | **No licence** shown on the [repo](https://github.com/ng-d-ng-may-tinh-K62-UET-M1/yolo-dataset); README says 400 images, shot day and night; image source not stated. No licence means no permission granted, so keep the images local and only cite | Used |
| **vn-plate-yolo** (plate training set, `vn-plate-yolo.zip`) | Plate detector training | Built on 2026-11-02 from the Hugging Face dataset [`hoanglvuit/Vietnam_License_Plate_Segment_Datasets`](https://huggingface.co/datasets/hoanglvuit/Vietnam_License_Plate_Segment_Datasets) (`dataset.zip`, 4,578 images, folder `TongHop` = "compilation", classes BSD long plate / BSV square plate, segmentation polygons). We converted polygons to boxes, merged both classes into one `plate` class and dropped 9 near-duplicates of benchmark images, leaving 4,569. **That page has no licence, no dataset card and no credits, so no permission is granted:** keep it local and cite. The five file-name groups inside it (`greenpack` 1,746, `carlong` 985, `Tgmt` 913, `Dieu` 495, `Hung` 430) are the uploader's merged sources; their own origins are unknown | Used |
| **trungdinh22 Character Detection Dataset** (`OCR.zip`) | Plate OCR benchmark (536 Vietnamese-format val plates), class mapping | **No licence** shown on the [repo](https://github.com/trungdinh22/License-Plate-Recognition); credits Mì Ai and winter2897 for part of the data. Keep local, cite | Used |
| **UFPR-ALPR** | Considered, **dropped** (needs a signed agreement by email, Brazilian plates, and the Vietnamese plate data already covers the matcher test). 4,500 images, 150 vehicles, 1920x1080 | Free for educational/research institutes, **academic research only, non-commercial**, by licence agreement; redistribution not addressed on the [GitHub page](https://www.github.com/raysonlaroca/ufpr-alpr-dataset), read the agreement. Cite: Laroca et al., IJCNN 2018 | Not used |
| **LFW** (Labeled Faces in the Wild; 13,233 photos, 5,749 people; original images, `lfw.tgz`) | Face whitelist benchmark (`engine/training/face`): owner kept vs stranger leaked | **No licence for the photos found.** What we checked: the [TensorFlow Datasets catalog page](https://www.tensorflow.org/datasets/catalog/lfw) and its [builder file](https://github.com/tensorflow/datasets/blob/master/tensorflow_datasets/datasets/lfw/lfw_dataset_builder.py) (Apache-2.0 header = licence of TensorFlow's code; it only names the homepage and the download URL), the [scikit-learn page](https://scikit-learn.org/stable/modules/generated/sklearn.datasets.fetch_lfw_pairs.html) (BSD = scikit-learn's), and a third-party tutorial repo (GPL-3.0 = that repo's code). None of these licenses the images, and the official site (vis-www.cs.umass.edu/lfw) did not load for us. The photos are web-scraped press pictures whose copyright is not ours, so: research benchmarking only, images stay local (`datasets/lfw/`, gitignored), never committed or redistributed, cite Huang et al., *Labeled Faces in the Wild*, UMass TR 07-49, 2007. Fetched by `engine/training/face/fetch.sh` from figshare file 5976018 (the same URL TFDS and scikit-learn use), SHA-256 `055f7d9c632d7370e6fb4afc7468d40f970c34a80d4c6f50ffec63f5a8d536c0` | Used, local only |
| Own dashcam footage | Planned: Vietnamese scene detection, OCR, video | Ours, so no licence issue. Bystanders' faces and plates are personal data: redact before publishing any frame | Not recorded yet |

Which benchmarks use which dataset, and what is still planned: [engine/training/whitelist-benchmarks.md](../engine/training/whitelist-benchmarks.md).

## Looked at and not used

| Dataset | Why not |
| --- | --- |
| Roboflow Universe Vietnamese plate sets | One plate per full-scene image, so nothing new over UET; licences vary per project (for example public domain and CC BY 4.0 on two of them) |
| CCPD | Chinese plates, one per image, parking-lot scenes |
| [Da Nang CCTV vehicle dataset](https://www.techscience.com/cmc/v88n1/67301) | Vehicles, pedestrians and traffic lights only (no plates or faces); the article gives no download link or data terms. The CC BY 4.0 notice is the article's, not necessarily the data's |

## When adding a dataset

Add a row first: what it is used for, the terms with the URL you read them at, and whether images may be committed (default: no).
