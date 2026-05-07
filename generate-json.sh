#!/usr/bin/env bash

# generate-questions-json.sh – includes files starting with _

set -euo pipefail

XML_DIR="questions"
OUTPUT_FILE="questions/questions.json"

TEMP_JSON=$(mktemp)

echo "Scanning ${XML_DIR}/*.xml ..."

# Start fresh
echo '[]' > "$TEMP_JSON"

# Include ALL .xml files (no -not -name "_*")
find "$XML_DIR" -type f -name "*.xml" | sort | while read -r file; do
  filename=$(basename "$file")

  # Special handling for _testing_example.xml
  if [[ $filename == _testing_example.xml ]]; then
    group_name="Testing / Misc"
  else
    # Your original regex + naming logic
    if [[ $filename =~ ^([a-z0-9-]+)-([a-z0-9-]+)-([a-z0-9.]+)-([A-Z]+)-(.+)\.xml$ ]]; then
      category="${BASH_REMATCH[1]}"
      test_name="${BASH_REMATCH[2]}"
      version="${BASH_REMATCH[3]}"
      lang="${BASH_REMATCH[4]}"
      rest="${BASH_REMATCH[5]}"

	echo "$test_name"
      group_name=""
      case "$category-$test_name" in
        itil4-foundation)
          group_name="ITIL 4 Foundation"
          ;;
        itil4-mp-dpi)
          group_name="ITIL 4 Managing Professional DPI"
          ;;
        prince2-foundation)
          group_name="PRINCE2 Foundation"
          ;;
        prince2-foundation-7)
          group_name="PRINCE2 Foundation 7"
          ;;
        *)
          group_name=$(echo "$category $test_name" | awk '{for(i=1;i<=NF;i++) $i=toupper(substr($i,1,1)) tolower(substr($i,2));}1')
          ;;
      esac

      if [[ $version != "7" && $version != "4.2" && $version != "2019" ]]; then
        group_name="${group_name} ${version}"
      fi

      case "$lang" in
        ENGLISH) lang_display="English" ;;
        GERMAN)  lang_display="German"  ;;
        *)       lang_display="$lang"   ;;
      esac

      group_name="${group_name} – ${lang_display}"
    else
      group_name="Other / Misc"
    fi
  fi

  # Append
  jq --arg group "$group_name" --arg file "$filename" \
    '. += [{"group": $group, "files": [$file]}]' \
    "$TEMP_JSON" > "$TEMP_JSON.tmp" && mv "$TEMP_JSON.tmp" "$TEMP_JSON"
done

# Merge duplicate groups
jq 'group_by(.group) | map({
  group: .[0].group,
  files: (map(.files[]) | unique | sort)
})' "$TEMP_JSON" > "$OUTPUT_FILE"

rm -f "$TEMP_JSON" "$TEMP_JSON.tmp"

echo "Generated: $OUTPUT_FILE"
echo "Groups created:"
jq -r '.[].group' "$OUTPUT_FILE"
