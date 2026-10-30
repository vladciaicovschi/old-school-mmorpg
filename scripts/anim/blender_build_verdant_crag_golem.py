"""Import Verdant Golem with supplied idle and supplemental heavy locomotion."""
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parent))
from blender_import_community_native import main

if __name__ == '__main__':
    main(['golem'])
