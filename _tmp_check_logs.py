import urllib.request, json, sys

job_id = sys.argv[1]
r = urllib.request.urlopen(f'https://api.github.com/repos/ViuGiaLai/researchmind/actions/jobs/{job_id}/logs')
# Logs are returned as text/plain
# The URL redirects to the actual log
print(f"Log URL for job {job_id}: {r.geturl()}")
# Just show first 200 lines
log_data = r.read().decode('utf-8', errors='replace')
lines = log_data.split('\n')
# Look for errors
for i, line in enumerate(lines):
    lower = line.lower()
    if 'error' in lower or 'failed' in lower or 'exit code' in lower or 'not found' in lower:
        start = max(0, i-2)
        end = min(len(lines), i+3)
        for j in range(start, end):
            marker = '>>>' if j == i else '   '
            print(f"{marker} {lines[j]}")
        print('---')
