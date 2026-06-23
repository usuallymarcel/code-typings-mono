#temp until set up db

THEMES = {    
    "dark": {
        "price": 0
    },
    "green": {
        "price": 50000,
        "css": """
[data-theme="green"] {
  --bg: #042c21;
  --button-text: #000000;
  --button-bg: rgb(59, 59, 59);
}
"""
    },

    "purple": {
        "price": 50000,
        "css": """
[data-theme="purple"] {
  --bg: #10042c;
  --button-text: #000000;
  --button-bg: #642075;
  --button-bg-bg: #493452;
}
"""
    },

    "orange": {
        "price": 50000,
        "css": """
[data-theme="orange"] {
  --bg: #7a460e;
  --button-text: #000000;
  --button-bg: #bb8600;
  --button-bg-bg: #654700;
}
"""
    },
     "terminal": {
        "price": 50000,
        "css": """
[data-theme="terminal"] {
  --bg:
    repeating-linear-gradient(
      0deg,
      rgba(51, 255, 102, 0.06) 0px,
      rgba(51, 255, 102, 0.06) 1px,
      transparent 1px,
      transparent 3px
    ),
    radial-gradient(
      circle at center,
      #021a0a,
      #000000 90%
    );

  --text: #33ff66;
  --button-bg: #0a1a0f;
  --button-bg-bg: #050d08;
  --button-text: #33ff66;

  --typings-base: #1f5c33;
  --typings-correct: #4dff7a;
  --typings-error: #ff3b3b;
  --typings-cursor: #4dff7a;
}
"""
    },

    "vscode": {
        "price": 50000,
        "css": """
[data-theme="vscode"] {
  --bg:
    linear-gradient(
      90deg,
      #333333 0px,
      #333333 48px,
      #252526 48px,
      #252526 288px,
      #1e1e1e 288px
    );

  --text: #d4d4d4;
  --button-bg: #0e639c;
  --button-bg-bg: #094771;
  --button-text: #ffffff;

  --typings-base: #6a9955;
  --typings-correct: #d4d4d4;
  --typings-error: #f44747;
  --typings-cursor: #569cd6;
}
"""
    },

    "github": {
        "price": 5000,
        "css": """
[data-theme="github"] {
  --bg:
    repeating-linear-gradient(
      0deg,
      rgba(57, 211, 83, 0.05) 0px,
      rgba(57, 211, 83, 0.05) 11px,
      transparent 11px,
      transparent 14px
    ),
    repeating-linear-gradient(
      90deg,
      rgba(57, 211, 83, 0.05) 0px,
      rgba(57, 211, 83, 0.05) 11px,
      transparent 11px,
      transparent 14px
    ),
    #0d1117;

  --text: #e6edf3;
  --button-bg: #238636;
  --button-bg-bg: #196c2e;
  --button-text: #ffffff;

  --typings-base: #8b949e;
  --typings-correct: #39d353;
  --typings-error: #f85149;
  --typings-cursor: #58a6ff;
}
"""
    },

"eye bleach": {
    "price": 50000,
    "css": """
[data-theme="eye bleach"] {
  --bg:
    radial-gradient(
      circle at 50% 30%,
      #ffffff,
      #fbfbfb 100%
    );

  --text: #111111;
  --button-bg: #2b579a;
  --button-bg-bg: #1e3f70;
  --button-text: #ffffff;

  --typings-base: #c8c8c8;
  --typings-correct: #111111;
  --typings-error: #d13438;
  --typings-cursor: #0078d4;
}
"""
},

    "spreadsheet": {
        "price": 50000,
        "css": """
[data-theme="spreadsheet"] {
  --bg:
    repeating-linear-gradient(
      0deg,
      #d0d7de 0px,
      #d0d7de 1px,
      transparent 1px,
      transparent 28px
    ),
    repeating-linear-gradient(
      90deg,
      #d0d7de 0px,
      #d0d7de 1px,
      transparent 1px,
      transparent 90px
    ),
    #ffffff;

  --text: #1e1e1e;
  --button-bg: #107c41;
  --button-bg-bg: #0b5e30;
  --button-text: #ffffff;

  --typings-base: #9aa0a6;
  --typings-correct: #107c41;
  --typings-error: #d13438;
  --typings-cursor: #107c41;
}
"""
    },

    "forest": {
        "price": 100000,
        "css": """
[data-theme="forest"] {
  --bg: #042c21;
  --text: #e0a38b;
  --button-bg: rgb(115, 68, 41);
  --button-bg-bg: #2f1711;
  --button-text: #000000;
  --typings-base: rgb(255, 255, 255);
  --typings-correct: rgb(0, 255, 123);
  --typings-error: rgb(255, 106, 0);
  --typings-cursor: rgb(46, 112, 102);
}
"""
    },

    "brown": {
        "price": 100000,
        "css": """
[data-theme="brown"] {
  --bg: #5f402c;
  --text: #ecbeaa;
  --button-bg: rgb(163, 137, 129);
  --button-bg-bg: #463323;
  --button-text: #000000;
  --typings-base: rgb(255, 255, 255);
  --typings-correct: rgb(255, 242, 0);
  --typings-error: rgb(255, 94, 0);
  --typings-cursor: rgb(103, 87, 63);
}
"""
    },

    "night": {
        "price": 100000,
        "css": """
[data-theme="night"] {
  --bg: #201824;
  --text: #d0fdf8;
  --button-bg: rgb(66, 103, 112);
  --button-bg-bg: #0c0f28;
  --button-text: #d0fdf8;
  --typings-base: rgb(255, 255, 255);
  --typings-correct: rgb(216, 209, 0);
  --typings-error: rgb(255, 0, 251);
  --typings-cursor: rgb(112, 112, 46);
}
"""
    },

    "minimal": {
        "price": 100000,
        "css": """
[data-theme="minimal"] {
  --bg: #1f2937;
  --text: #e5e7eb;
  --button-bg: #b7acb9;
  --button-bg-bg: #a389a3;
  --button-text: #000000;
  --typings-base: rgb(255, 255, 255);
  --typings-correct: rgb(255, 136, 190);
  --typings-error: rgb(197, 41, 41);
  --typings-cursor: rgb(61, 82, 80);
}
"""
    },

    "ice": {
        "price": 100000,
        "css": """
[data-theme="ice"] {
  --bg: #5b99b6;
  --text: #082f49;
  --button-bg: #6e8a8a;
  --button-bg-bg: #6e8a8a;
  --button-text: #000000;
  --typings-base: rgb(49, 49, 49);
  --typings-correct: rgb(14, 0, 140);
  --typings-error: rgb(189, 51, 51);
  --typings-cursor: rgb(255, 255, 255);
}
"""
    },

    "sunset": {
        "price": 200000,
        "css": """
[data-theme="sunset"] {
  --bg: linear-gradient(135deg, #fff25f, #feba7b, #ff6200);
  --text: #000000;
  --button-bg: #b35100;
  --button-bg-bg: #171717;
  --button-text: #472000;
  --typings-base: rgb(0, 0, 0);
  --typings-correct: rgb(0, 158, 147);
  --typings-error: rgb(184, 88, 161);
  --typings-cursor: rgb(255, 255, 255);
}
"""
    },

    "ocean": {
        "price": 200000,
        "css": """
[data-theme="ocean"] {
  --bg: linear-gradient(to bottom, #113e7d, #04b2cd, rgb(87, 160, 198));
  --text: #ffffff;
  --button-bg: #ffffff;
  --button-bg-bg: #171717;
  --button-text: #1b0047;
  --typings-base: rgb(0, 0, 0);
  --typings-correct: rgb(26, 255, 0);
  --typings-error: rgb(255, 0, 0);
  --typings-cursor: rgb(255, 255, 255);
}
"""
    },

    "neon": {
        "price": 200000,
        "css": """
[data-theme="neon"] {
  --bg:
    radial-gradient(circle at 10% 50%, rgba(168,85,247,0.4), transparent 80%),
    radial-gradient(circle at 90% 50%, rgba(236,72,153,0.4), transparent 80%),
    #020617;
  --text: #f5f3ff;
  --button-bg: rgb(215, 255, 251);
  --button-bg-bg: #44524f;
  --button-text: #000000;
  --typings-base: rgb(255, 255, 255);
  --typings-correct: rgb(216, 209, 0);
  --typings-error: rgb(255, 0, 251);
  --typings-cursor: rgb(112, 112, 46);
}
"""
    },

    "ember": {
        "price": 300000,
        "css": """
[data-theme="ember"] {
  --bg: linear-gradient(135deg, #c7906e, #7c2d12, #5f2410);
  --text: #fffae4;
  --button-bg: rgb(191, 165, 165);
  --button-bg-bg: #602828;
  --button-text: #15110c;
  --typings-base: #fffae4;
  --typings-correct: rgb(255, 242, 0);
  --typings-error: rgb(255, 94, 0);
  --typings-cursor: rgb(125, 97, 51);
}
"""
    },

    "aurora": {
        "price": 300000,
        "css": """
[data-theme="aurora"] {
  --bg:
    radial-gradient(circle at 20% 80%, rgba(34,197,94,0.3), transparent 80%),
    radial-gradient(circle at 80% 20%, rgba(59,130,246,0.3), transparent 80%),
    radial-gradient(circle at 50% 50%, rgba(168,85,247,0.3), transparent 80%),
    #020617;
  --text: #e5e7eb;
  --button-bg: #b9acac;
  --button-bg-bg: #938787;
  --button-text: #000000;
  --typings-base: #e5e7eb;
  --typings-correct: rgb(0, 187, 97);
  --typings-error: rgb(0, 149, 255);
  --typings-cursor: rgb(61, 82, 80);
}
"""
    },
    "----" : {
        "price": 111111,
        "css": """[data-theme="----"] {
                --bg: repeating-linear-gradient(
                0deg,
                #1a332b,
                #1a332b 2px,
                #142828 2px,
                #142822 4px
                );
                --text: #000000;
                --button-bg: repeating-linear-gradient(
                0deg,
                #1a332b,
                #1a332b 2px,
                #142828 2px,
                #142822 4px
                );
                --button-bg-bg: ;
                --button-text: #000000;
                --typings-base: rgb(0, 0, 0);
                --typings-correct: rgb(77, 140, 79);
                --typings-error: rgb(153, 105, 209);
                --typings-cursor: rgb(61, 82, 80);
                }"""
    }
}
