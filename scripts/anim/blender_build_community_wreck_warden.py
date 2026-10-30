"""Import only the owner's merged native Wreck Warden animation pack."""
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parent))
from blender_import_community_native import main

if __name__ == '__main__':
    main(['warden'])
