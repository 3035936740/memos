package version

import (
	_ "embed"
	"fmt"
	"strings"

	"golang.org/x/mod/semver"
)

// Version is set by release builds and defaults to a development build marker.
var Version = "dev"

// PlusVersion is the independently versioned Memos Plus release.
var PlusVersion = "1.0.0-dev"

//go:embed upstream-version.txt
var upstreamVersionFile string

// UpstreamVersion is the schema compatibility version shared with release tooling.
func UpstreamVersion() string { return strings.TrimSpace(upstreamVersionFile) }

// GetDisplayVersion describes the fork release without changing upstream schema semantics.
func GetDisplayVersion() string {
	base := Version
	if base == "dev" {
		base = UpstreamVersion() + "-dev"
	}
	return fmt.Sprintf("%s (based on Memos %s)", PlusVersion, base)
}

// Commit is set by CI builds and defaults to an unknown revision marker.
var Commit = "unknown"

func GetCurrentVersion() string {
	return Version
}

// GetMinorVersion extracts the minor version (e.g., "0.25") from a full version string (e.g., "0.25.1").
// Returns the minor version string or empty string if the version format is invalid.
// Version format should be "major.minor.patch" (e.g., "0.25.1").
func GetMinorVersion(version string) string {
	versionList := strings.Split(version, ".")
	if len(versionList) < 2 {
		return ""
	}
	// Return major.minor only (first two components)
	return versionList[0] + "." + versionList[1]
}

// IsVersionGreaterOrEqualThan returns true if version is greater than or equal to target.
func IsVersionGreaterOrEqualThan(version, target string) bool {
	return semver.Compare(fmt.Sprintf("v%s", version), fmt.Sprintf("v%s", target)) > -1
}

// IsVersionGreaterThan returns true if version is greater than target.
func IsVersionGreaterThan(version, target string) bool {
	return semver.Compare(fmt.Sprintf("v%s", version), fmt.Sprintf("v%s", target)) > 0
}

type SortVersion []string

func (s SortVersion) Len() int {
	return len(s)
}

func (s SortVersion) Swap(i, j int) {
	s[i], s[j] = s[j], s[i]
}

func (s SortVersion) Less(i, j int) bool {
	v1 := fmt.Sprintf("v%s", s[i])
	v2 := fmt.Sprintf("v%s", s[j])
	return semver.Compare(v1, v2) == -1
}
