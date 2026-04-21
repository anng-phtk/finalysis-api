import requests
from bs4 import BeautifulSoup
import re
import sys
import os

def fetch_sec_filing(url):
    """Fetches the raw HTML from the SEC using the required User-Agent."""
    headers = {
        'User-Agent': 'Finalysis_Terminal (your.email@example.com)' 
    }
    response = requests.get(url, headers=headers, timeout=15)
    response.raise_for_status()
    return response.text

def serialize_html_table(table):
    """Flattens a table into a serialized text format that is easier for LLMs to read than broken markdown pipes."""
    serialized_rows = []
    
    for tr in table.find_all('tr'):
        cells = tr.find_all(['td', 'th'])
        cleaned_cells = []
        for cell in cells:
            text = cell.get_text().strip()
            # Clean up the text
            text = text.replace('\xa0', ' ')
            text = re.sub(r'\s+', ' ', text)
            if text:
                cleaned_cells.append(text)
        
        if cleaned_cells:
            # Format as a serialized row
            row_str = " | ".join(cleaned_cells)
            serialized_rows.append(f"[TABLE_ROW]: {row_str}")

    if not serialized_rows:
        return ""

    return "\n[TABLE_START]\n" + "\n".join(serialized_rows) + "\n[TABLE_END]\n"

def clean_html_to_markdown(html_content):
    """Converts HTML to Markdown-like text, serializing tables and cleaning structure."""
    soup = BeautifulSoup(html_content, 'html.parser')

    # Serialize tables instead of trying to maintain columnar layout
    for table in soup.find_all('table'):
        serialized_table = serialize_html_table(table)
        table.replace_with(serialized_table)

    # Extract text with newline separators
    raw_text = soup.get_text(separator='\n')

    # Basic cleanup
    lines = []
    for line in raw_text.split('\n'):
        line = line.strip()
        if line:
            lines.append(line)
            
    return '\n'.join(lines)

def extract_all_sections(text):
    """Extracts Item 1, 1A, 3, and 7 using regex boundaries."""
    # Note: Regex includes positive lookahead to stop at the next logical section start.
    # We use [\s\S]*? for non-greedy match including newlines.
    patterns = {
        "Item 1: Business": r"(Item\s+1\.\s+Business[\s\S]*?)(?=Item\s+1A\.|Item\s+2\.)",
        "Item 1A: Risk Factors": r"(Item\s+1A\.\s+Risk Factors[\s\S]*?)(?=Item\s+1B\.|Item\s+2\.)",
        "Item 3: Legal Proceedings": r"(Item\s+3\.\s+Legal Proceedings[\s\S]*?)(?=Item\s+4\.)",
        "Item 7: MD&A": r"(Item\s+7\.\s+Management[\s\S]*?)(?=Item\s+7[A-Z]\.|Item\s+8\.)"
    }
    
    extracted = {}
    for section_name, pattern in patterns.items():
        # FIND ALL matches because TOC often matches first. 
        # The 'real' section is almost always the longest one found that isn't just a single line.
        matches = re.finditer(pattern, text, re.IGNORECASE)
        best_match = None
        max_len = -1
        
        for m in matches:
            content = m.group(1).strip()
            # If content is short (e.g. < 500 chars), it's likely just a Table of Contents entry
            if len(content) > max_len:
                max_len = len(content)
                best_match = content
        
        extracted[section_name] = best_match if best_match and max_len > 300 else "Section not found or could not be isolated."
        
    return extracted

def save_analysis(sections, url):
    """Saves the extracted sections to a local markdown file."""
    # Attempt to extract CIK/Ticker for the filename
    cik_match = re.search(r'/edgar/data/(\d+)/', url)
    identifier = cik_match.group(1) if cik_match else "analysis"
    
    filename = f"sec_report_{identifier}.md"
    
    with open(filename, 'w', encoding='utf-8') as f:
        f.write(f"# SEC Filing Analysis Report\n")
        f.write(f"- **Source:** {url}\n\n")
        f.write("---\n\n")
        
        for name, content in sections.items():
            f.write(f"## {name}\n\n")
            f.write(content)
            f.write("\n\n---\n\n")
            
    return filename

def main():
    if len(sys.argv) < 2:
        print("Usage: python sec_parser.py <SEC_FILING_URL>", file=sys.stderr)
        sys.exit(1)
        
    target_url = sys.argv[1]
    
    try:
        print(f"[*] Fetching filing from {target_url}...", file=sys.stderr)
        raw_html = fetch_sec_filing(target_url)
        
        print("[*] Parsing content and converting tables...", file=sys.stderr)
        md_text = clean_html_to_markdown(raw_html)
        
        print("[*] Extracting sections...", file=sys.stderr)
        sections = extract_all_sections(md_text)
        
        print("[*] Saving to markdown...", file=sys.stderr)
        report_file = save_analysis(sections, target_url)
        
        # Final output for consumer
        print(f"\n[SUCCESS] Analysis complete. Saved to {report_file}", file=sys.stderr)
        
        # For compatibility with potential Node.js wrapper, we print the path or main content
        # Here we'll print the full markdown result to stdout
        for name, content in sections.items():
            print(f"### {name}\n")
            print(content)
            print("\n" + "="*50 + "\n")
            
    except Exception as e:
        print(f"[ERROR] Failed to process URL: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc(file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
