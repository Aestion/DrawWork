"""
Screenshot Diff — 截图 + 像素级对比
用于视觉回归验证：实际截图 vs 基线对比
"""
from pathlib import Path
from datetime import datetime
from typing import Tuple
import os

try:
    from PIL import Image, ImageChops, ImageDraw, ImageFont
except ImportError:
    raise ImportError("Pillow not installed. Run: pip install Pillow")

try:
    import pyautogui
except ImportError:
    pyautogui = None  # Allow import even without pyautogui

TEST_ROOT = Path(__file__).resolve().parent.parent
BASELINE_DIR = TEST_ROOT / "visual-baseline" / "baselines"
RESULTS_DIR = TEST_ROOT / "results"
DIFFS_DIR = RESULTS_DIR / "diffs"
SCREENSHOTS_DIR = RESULTS_DIR / "screenshots"

# Ensure output dirs exist
DIFFS_DIR.mkdir(parents=True, exist_ok=True)
SCREENSHOTS_DIR.mkdir(parents=True, exist_ok=True)
BASELINE_DIR.mkdir(parents=True, exist_ok=True)


class ScreenshotDiff:
    """截图 + 像素级对比工具"""

    DEFAULT_THRESHOLD = float(os.environ.get("VISUAL_DIFF_THRESHOLD", "0.05"))

    def __init__(self, threshold: float | None = None):
        self.threshold = threshold or self.DEFAULT_THRESHOLD

    # ─── capture ────────────────────────────────────────────

    @staticmethod
    def capture_fullscreen(name: str) -> Path:
        """截取全屏"""
        if pyautogui is None:
            raise RuntimeError("pyautogui required for screenshot capture")

        path = SCREENSHOTS_DIR / f"{name}_{int(datetime.now().timestamp())}.png"
        img = pyautogui.screenshot()
        img.save(path)
        return path

    @staticmethod
    def capture_region(name: str, x1: int, y1: int, x2: int, y2: int) -> Path:
        """截取指定区域 (屏幕绝对坐标)"""
        if pyautogui is None:
            raise RuntimeError("pyautogui required for screenshot capture")

        path = SCREENSHOTS_DIR / f"{name}_{int(datetime.now().timestamp())}.png"
        img = pyautogui.screenshot(region=(x1, y1, x2 - x1, y2 - y1))
        img.save(path)
        return path

    # ─── compare ────────────────────────────────────────────

    def compare(self, actual: Image.Image | Path, baseline_name: str) -> dict:
        """
        与基线对比。

        Args:
            actual: PIL Image 或截图文件路径
            baseline_name: 基线文件名 (如 'excalidraw_empty.png')，会从 BASELINE_DIR 加载

        Returns:
            {
                "passed": bool,
                "diff_pct": float,      # 差异像素百分比 (0.0~1.0)
                "diff_path": str,       # 差异图路径 (仅失败时)
                "baseline_path": str,
                "actual_path": str,
                "message": str,
            }
        """
        baseline_path = BASELINE_DIR / baseline_name

        # Load images
        if isinstance(actual, Path):
            actual_path = actual
            actual_img = Image.open(actual_path)
        elif isinstance(actual, str):
            actual_path = Path(actual)
            actual_img = Image.open(actual_path)
        else:
            actual_img = actual
            actual_path = SCREENSHOTS_DIR / f"actual_{baseline_name}"

        actual_img.save(actual_path)

        if not baseline_path.exists():
            return {
                "passed": False,
                "diff_pct": 1.0,
                "diff_path": "",
                "baseline_path": str(baseline_path),
                "actual_path": str(actual_path),
                "message": f"Baseline not found: {baseline_name}. Run update_baseline() first.",
            }

        baseline_img = Image.open(baseline_path)

        # Ensure same size
        w1, h1 = actual_img.size
        w2, h2 = baseline_img.size
        if (w1, h1) != (w2, h2):
            new_size = (max(w1, w2), max(h1, h2))
            actual_img = self._pad_image(actual_img, new_size)
            baseline_img = self._pad_image(baseline_img, new_size)

        # Pixel-level diff
        diff_img = self._generate_diff(baseline_img, actual_img)
        total_pixels = actual_img.size[0] * actual_img.size[1]
        if total_pixels == 0:
            return {"passed": True, "diff_pct": 0, "message": "Empty image"}

        diff_pixels = sum(
            1 for px in diff_img.getdata()
            if px != (0, 0, 0)
        )
        diff_pct = diff_pixels / (total_pixels * 3)

        passed = diff_pct <= self.threshold

        diff_path = ""
        if not passed:
            ts = int(datetime.now().timestamp())
            diff_path = DIFFS_DIR / f"diff_{baseline_name.replace('.png', '')}_{ts}.png"
            diff_img.save(diff_path)

        return {
            "passed": passed,
            "diff_pct": round(diff_pct, 4),
            "diff_path": str(diff_path),
            "baseline_path": str(baseline_path),
            "actual_path": str(actual_path),
            "message": (
                f"PASS ({diff_pct:.2%} ≤ {self.threshold:.0%})"
                if passed
                else f"FAIL ({diff_pct:.2%} > {self.threshold:.0%})"
            ),
        }

    # ─── baseline management ────────────────────────────────

    @staticmethod
    def update_baseline(name: str, image: Image.Image | Path):
        """将当前截图设为基线"""
        target = BASELINE_DIR / name
        if isinstance(image, Path):
            img = Image.open(image)
        else:
            img = image
        img.save(target)
        print(f"  📸 Baseline updated: {target}")

    @staticmethod
    def list_baselines() -> list[str]:
        """列出所有基线文件名"""
        return sorted([f.name for f in BASELINE_DIR.glob("*.png")])

    # ─── helpers ────────────────────────────────────────────

    @staticmethod
    def _pad_image(img: Image.Image, size: Tuple[int, int]) -> Image.Image:
        """Pad image to given size with white background."""
        if img.size == size:
            return img
        padded = Image.new("RGB", size, (255, 255, 255))
        padded.paste(img, (0, 0))
        return padded

    @staticmethod
    def _generate_diff(img1: Image.Image, img2: Image.Image) -> Image.Image:
        """Generate a visual diff image.
        - Green pixels: present in img2 but not img1 (additions)
        - Red pixels: present in img1 but not img2 (deletions)
        - Black pixels: identical
        """
        # Ensure RGB
        img1 = img1.convert("RGB")
        img2 = img2.convert("RGB")

        diff = ImageChops.difference(img1, img2)

        # Colorize: non-zero diffs → red, zero → black
        diff_data = diff.getdata()
        colorized = []
        for px in diff_data:
            if px != (0, 0, 0):
                colorized.append((255, 0, 0))  # red = difference
            else:
                colorized.append((0, 0, 0))

        color_diff = Image.new("RGB", diff.size)
        color_diff.putdata(colorized)
        return color_diff


# ─── quick test ─────────────────────────────────────────────
if __name__ == "__main__":
    from pathlib import Path

    diff_tool = ScreenshotDiff(threshold=0.05)

    # Create two test images
    img1 = Image.new("RGB", (200, 100), (255, 255, 255))
    draw1 = ImageDraw.Draw(img1)
    draw1.rectangle([20, 20, 100, 80], fill=(0, 0, 255))

    img2 = Image.new("RGB", (200, 100), (255, 255, 255))
    draw2 = ImageDraw.Draw(img2)
    draw2.rectangle([20, 20, 100, 80], fill=(255, 0, 0))  # Different color

    # Save & compare
    diff_tool.update_baseline("test_baseline.png", img1)
    result = diff_tool.compare(img2, "test_baseline.png")
    print(f"Test diff: {result['message']}")

    # Cleanup
    (BASELINE_DIR / "test_baseline.png").unlink(missing_ok=True)
