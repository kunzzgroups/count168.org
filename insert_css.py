import os
import glob

files = glob.glob("*.php")
link_tag = """    <link rel="stylesheet" href="css/global-13inch.css?v=<?php echo file_exists('css/global-13inch.css') ? filemtime('css/global-13inch.css') : time(); ?>">
"""

for filepath in files:
    with open(filepath, "r", encoding="utf-8", errors="ignore") as f:
        content = f.read()

    if "global-13inch.css" not in content and "</head>" in content:
        # insert right before </head>
        content = content.replace("</head>", link_tag + "</head>")
        with open(filepath, "w", encoding="utf-8") as f:
            f.write(content)
        print(f"Updated {filepath}")
    else:
        print(f"Skipped {filepath}")

