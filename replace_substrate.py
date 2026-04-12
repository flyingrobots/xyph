import re
import os
import sys

def should_replace(match, text):
    start, end = match.start(), match.end()
    
    # Check if it's part of a URL or path
    # Look back for http://, https://, or /
    # Look forward for /
    
    # Check preceding characters
    pre = text[max(0, start-10):start]
    if 'http://' in pre or 'https://' in pre:
        return False
    if pre.endswith('/') or pre.endswith('\\') or pre.endswith('.'):
        return False
        
    # Check following characters
    post = text[end:end+1]
    if post.startswith('/') or post.startswith('\\') or post.startswith('.'):
        return False

    # Check if inside markdown link target: ]( ... substrate ... )
    # This is a bit complex, but we can check if it's preceded by ]( and followed by )
    # or if it's inside a string that looks like a path
    
    # Look back for the nearest [ or (
    bracket_start = text.rfind('[', 0, start)
    paren_start = text.rfind('(', 0, start)
    
    if paren_start > bracket_start:
        # Check if this paren is preceded by ]
        if text[paren_start-1:paren_start] == ']':
            # It's likely a link target. Check if it's closed
            paren_end = text.find(')', end)
            if paren_end != -1 and '(' not in text[end:paren_end]:
                return False

    return True

def replace_in_file(file_path):
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()

    def replacer(match):
        if not should_replace(match, content):
            return match.group(0)
        
        word = match.group(0)
        if word == 'Substrate':
            return 'Bedrock'
        elif word == 'substrate':
            # Default to bedrock unless communication/environment context
            # We'll check the surrounding context for "communication" or "environment"
            context = content[max(0, match.start()-100):min(len(content), match.end()+100)].lower()
            if 'communication' in context or 'environment' in context:
                return 'medium'
            return 'bedrock'
        return word

    # Use \b for word boundaries to avoid matching things like "substrates" 
    # but wait, the instructions didn't specify word boundaries. 
    # "replace the word 'substrate'" usually means word boundaries.
    # However, things like "substrate-boundary" should be matched.
    # Let's use a regex that matches "substrate" as a whole word or with hyphens.
    
    new_content = re.sub(r'(?i)substrate', replacer, content)
    
    if new_content != content:
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(new_content)
        return True
    return False

if __name__ == "__main__":
    files = sys.stdin.read().splitlines()
    for f in files:
        if os.path.isfile(f):
            changed = replace_in_file(f)
            if changed:
                print(f"Updated: {f}")
