#!/bin/bash
set -e

VOLITION_PACKAGE="volition-r91_b75.zip"

cd "$(dirname "$(readlink -f "$0" || realpath "$0")")"

# download volition tools
if ! [ -e "tools/$VOLITION_PACKAGE" ]; then
  echo "Downloading Volition Extraction Tools"
  wget "http://svn.gib.me/builds/volition/$VOLITION_PACKAGE" -O "tools/$VOLITION_PACKAGE"
fi

# unzip volition tools
if ! [ -e "tools/bin_rf3" ]; then
  echo "Unzipping Volition Extraction Tools"
  unzip "tools/$VOLITION_PACKAGE" 'bin_rf3/*' -d tools
  chmod +x tools/bin_rf3/Gibbed.RedFaction3.UnpackVPP.exe
fi

# download unxwb
if ! [ -e "tools/unxwb.zip" ]; then
  echo "Downloading unxwb"
  wget http://aluigi.altervista.org/papers/unxwb.zip -O tools/unxwb.zip
fi

# extract unxwb
if ! [ -e "tools/unxwb.exe" ]; then
  echo "Extracting unxwb"
  unzip tools/unxwb.zip unxwb.exe -d tools
  chmod +x tools/unxwb.exe
fi

# extract sounds.vpp_pc
if ! [ -e "resources/sounds/mus_progression_01.xwb_pc" ]; then
  echo "Extracting sounds archive"
  mkdir resources/sounds
  tools/bin_rf3/Gibbed.RedFaction3.UnpackVPP.exe resources/sounds_r.vpp_pc resources/sounds
fi

for xwb in resources/sounds/*xwb_pc; do
  filename="$(basename "$xwb")"
  name="$(basename "$filename" .xwb_pc)"
  newname="resources/sounds/$name.xwb"
  dirname="resources/sounds/$name"
  [ -e "$dirname" ] && continue	# already done
  echo "Extracting $xwb"
  [ -e "$newname" ] || ln -s "$filename" "$newname"
  [ -e "$dirname" ] || mkdir "$dirname"
  tools/unxwb.exe -d "$dirname" "$newname"
done

for names in *.names; do
  name="$(basename "$names" .names)"
  dirname="resources/sounds/$name"
  if [ -e "$dirname" ]; then
    echo "Applying names for $name"
    index=0
    cat "$names" | while read name; do
      wavname=$(printf "%08x.wav" "$index")
      index=$((index+1))
      [ -n "$name" ] || continue
      [ -e "$dirname/$name.wav" ] && continue
      ln -s "$wavname" "$dirname/$name.wav"
    done
  fi
done

