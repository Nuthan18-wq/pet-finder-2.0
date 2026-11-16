from __future__ import annotations

import base64
import logging
import os
from typing import Any, Dict, List, Optional, Union

import cv2
import numpy as np
import open_clip
from PIL import Image
import torch


logger = logging.getLogger("pet_finder.ai")
logging.basicConfig(level=logging.INFO)


def cosine_similarity(v1: List[float], v2: List[float]) -> float:
    arr1 = np.asarray(v1, dtype=np.float32)
    arr2 = np.asarray(v2, dtype=np.float32)
    if arr1.shape != arr2.shape:
        raise ValueError("Embedding vectors must have the same dimensions.")
    norm1 = float(np.linalg.norm(arr1))
    norm2 = float(np.linalg.norm(arr2))
    if norm1 == 0 or norm2 == 0:
        return 0.0
    similarity = float(np.dot(arr1, arr2)) / (norm1 * norm2)
    return max(-1.0, min(1.0, similarity))


class PetVisionEngine:
    """
    AI Visual Matching Engine for Pet-Finder.
    Uses OpenCV for image pre-processing and OpenCLIP (ViT-B-32)
    to generate normalized 512-dimensional visual embeddings.
    """
    _instance: Optional["PetVisionEngine"] = None

    def __new__(cls) -> "PetVisionEngine":
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._initialized = False
        return cls._instance

    def __init__(self) -> None:
        if getattr(self, "_initialized", False):
            return
        
        self.device = torch.device("cpu")
        self.model_name = "ViT-B-32"
        self.pretrained = "laion2b_s34b_b79k"
        
        logger.info(f"Loading OpenCLIP model ({self.model_name}, {self.pretrained})...")
        try:
            self.model, _, self.preprocess = open_clip.create_model_and_transforms(
                self.model_name,
                pretrained=self.pretrained,
                device=self.device
            )
            self.model.eval()
            self.embedding_dim = 512
            logger.info("OpenCLIP model loaded and set to evaluation mode.")
        except Exception as e:
            logger.error(f"Failed to load OpenCLIP model: {e}")
            raise RuntimeError(f"Could not initialize OpenCLIP model: {e}")

        self._initialized = True

    def preprocess_image_bytes(self, image_data: bytes) -> Image.Image:
        """
        Receives raw image bytes, decodes with OpenCV, performs BGR->RGB
        color conversion, resizes if excessively large, and returns a PIL Image.
        """
        nparr = np.frombuffer(image_data, np.uint8)
        bgr_image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if bgr_image is None:
            raise ValueError("Invalid or corrupted image format. OpenCV could not decode.")

        # OpenCV BGR -> RGB
        rgb_image = cv2.cvtColor(bgr_image, cv2.COLOR_BGR2RGB)

        # Scale down if width or height > 1600 to optimize memory & speed
        height, width = rgb_image.shape[:2]
        max_dim = 1600
        if max(height, width) > max_dim:
            scale = max_dim / float(max(height, width))
            new_w = int(width * scale)
            new_h = int(height * scale)
            rgb_image = cv2.resize(rgb_image, (new_w, new_h), interpolation=cv2.INTER_AREA)

        return Image.fromarray(rgb_image)

    def preprocess_image_file(self, file_path: str) -> Image.Image:
        """
        Preprocesses an image file on disk using OpenCV and returns a PIL Image.
        """
        if not os.path.exists(file_path):
            raise FileNotFoundError(f"Image not found at {file_path}")

        bgr_image = cv2.imread(file_path, cv2.IMREAD_COLOR)
        if bgr_image is None:
            raise ValueError(f"Could not load image file from {file_path}")

        rgb_image = cv2.cvtColor(bgr_image, cv2.COLOR_BGR2RGB)
        return Image.fromarray(rgb_image)

    def generate_embedding(self, source: Union[str, bytes, Image.Image]) -> List[float]:
        """
        Generates a 512-dimensional normalized float embedding vector.
        Source can be:
        - file path (str)
        - base64 data string (str starting with 'data:image/')
        - raw image bytes (bytes)
        - PIL Image (Image.Image)
        """
        pil_image: Image.Image
        if isinstance(source, Image.Image):
            pil_image = source
        elif isinstance(source, bytes):
            pil_image = self.preprocess_image_bytes(source)
        elif isinstance(source, str):
            if source.startswith("data:image"):
                _, encoded = source.split(",", 1)
                image_bytes = base64.b64decode(encoded)
                pil_image = self.preprocess_image_bytes(image_bytes)
            elif os.path.exists(source):
                pil_image = self.preprocess_image_file(source)
            else:
                raise ValueError(f"Cannot resolve image source: {source[:80]}...")
        else:
            raise TypeError(f"Unsupported image source type: {type(source)}")

        # Transform using CLIP's exact preprocessor (resize 224, center crop, normalize)
        image_tensor = self.preprocess(pil_image).unsqueeze(0).to(self.device)

        with torch.no_grad():
            features = self.model.encode_image(image_tensor)
            # L2 normalize
            norm = features.norm(dim=-1, keepdim=True)
            if norm.item() > 0:
                features = features / norm
            
            vector = features.squeeze(0).cpu().numpy().tolist()

        return [float(v) for v in vector]

    @staticmethod
    def cosine_similarity(v1: List[float], v2: List[float]) -> float:
        return cosine_similarity(v1, v2)

    @staticmethod
    def get_confidence_badge(similarity: float) -> str:
        """
        Categorizes visual similarity score into human-readable confidence badges.
        Note: These represent visual similarity, not proof of identity.
        """
        if similarity >= 0.70:
            return "High Visual Similarity"
        elif similarity >= 0.52:
            return "Medium Visual Similarity"
        else:
            return "Low Visual Similarity"

    def rank_candidates(
        self,
        query_embedding: List[float],
        candidates: List[Dict[str, Any]],
        exclude_id: Optional[str] = None,
        min_similarity: float = 0.20
    ) -> List[Dict[str, Any]]:
        """
        Ranks candidate pets against query embedding, sorted descending by cosine similarity.
        """
        matches = []
        for pet in candidates:
            pet_id = pet.get("id") or str(pet.get("_id", ""))
            if exclude_id and pet_id == exclude_id:
                continue

            embedding = pet.get("embedding")
            if not embedding or not isinstance(embedding, list) or len(embedding) == 0:
                continue

            score = self.cosine_similarity(query_embedding, embedding)
            if score >= min_similarity:
                matches.append({
                    "pet": pet,
                    "pet_id": pet_id,
                    "similarity_score": round(score, 4),
                    "similarity_percentage": round(score * 100, 1),
                    "confidence_badge": self.get_confidence_badge(score),
                    "disclaimer": "Visual similarity is an AI comparison signal, not verified proof of identity. Always inspect physical markings, microchip, and message the finder before meeting."
                })

        matches.sort(key=lambda x: x["similarity_score"], reverse=True)
        return matches


# Singleton engine instance accessor
_engine_instance: Optional[PetVisionEngine] = None

def get_vision_engine() -> PetVisionEngine:
    global _engine_instance
    if _engine_instance is None:
        _engine_instance = PetVisionEngine()
    return _engine_instance
