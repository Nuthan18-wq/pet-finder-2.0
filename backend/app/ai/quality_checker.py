from __future__ import annotations

import logging
import os
from typing import Any, Dict, List, Union
import cv2
import numpy as np

logger = logging.getLogger("pet_finder.quality")


class PhotoQualityChecker:
    """
    AI Photo Quality Inspector:
    Evaluates blurriness, exposure, resolution, and subject visibility
    prior to submitting lost or found pet reports.
    """

    @classmethod
    def evaluate_image(cls, image_source: Union[str, bytes]) -> Dict[str, Any]:
        img_bgr = None
        if isinstance(image_source, str) and os.path.exists(image_source):
            img_bgr = cv2.imread(image_source)
        elif isinstance(image_source, bytes):
            nparr = np.frombuffer(image_source, np.uint8)
            img_bgr = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

        if img_bgr is None:
            return {
                "valid": False,
                "score": 0,
                "rating": "Invalid",
                "issues": ["Could not decode image file format."],
                "suggestions": ["Please upload a standard JPG, JPEG, or PNG photograph."],
            }

        height, width = img_bgr.shape[:2]
        gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)

        issues: List[str] = []
        suggestions: List[str] = []
        passed_checks: List[str] = []

        # 1. Blur Detection using Laplacian Variance
        laplacian_var = float(cv2.Laplacian(gray, cv2.CV_64F).var())
        is_blurry = laplacian_var < 70.0
        if is_blurry:
            issues.append(f"Image appears blurry or out of focus (sharpness index: {int(laplacian_var)}/100).")
            suggestions.append("Hold the camera steady or take a photo when the pet is resting.")
        else:
            passed_checks.append("Image is sharp and in focus.")

        # 2. Exposure & Lighting Check
        mean_brightness = float(np.mean(gray))
        is_dark = mean_brightness < 45.0
        is_washed_out = mean_brightness > 225.0
        if is_dark:
            issues.append("Photograph has insufficient lighting / is too dark.")
            suggestions.append("Take the photo near a window or outdoors in daylight.")
        elif is_washed_out:
            issues.append("Photograph is overexposed / washed out with glare.")
            suggestions.append("Avoid direct flash reflections on the pet's eyes or coat.")
        else:
            passed_checks.append("Lighting and contrast are well balanced.")

        # 3. Resolution Check
        is_low_res = width < 300 or height < 300
        if is_low_res:
            issues.append(f"Low image resolution ({width}x{height} px).")
            suggestions.append("Upload an original resolution image rather than a small thumbnail.")
        else:
            passed_checks.append(f"Adequate resolution ({width}x{height} px).")

        # 4. Subject Visibility & Texture Contrast
        std_dev = float(np.std(gray))
        is_blank = std_dev < 22.0
        if is_blank:
            issues.append("Low texture contrast; the pet subject may be obscured or blended into the background.")
            suggestions.append("Frame the pet in the center so distinctive facial features and body markings are visible.")
        else:
            passed_checks.append("Distinct subject contrast detected.")

        # Calculate Overall Quality Score (0 - 100)
        score = 100
        if is_blurry:
            score -= 35
        if is_dark or is_washed_out:
            score -= 30
        if is_low_res:
            score -= 20
        if is_blank:
            score -= 25
        score = max(10, min(100, score))

        if score >= 80:
            rating = "Excellent"
            status_color = "emerald"
        elif score >= 55:
            rating = "Good"
            status_color = "amber"
        else:
            rating = "Needs Improvement"
            status_color = "rose"

        return {
            "valid": True,
            "score": score,
            "rating": rating,
            "status_color": status_color,
            "laplacian_variance": round(laplacian_var, 1),
            "mean_brightness": round(mean_brightness, 1),
            "resolution": f"{width}x{height}",
            "issues": issues,
            "suggestions": suggestions,
            "passed_checks": passed_checks,
            "suitable_for_matching": score >= 50,
        }
