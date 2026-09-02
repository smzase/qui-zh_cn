// Copyright (c) 2025-2026, s0up and the autobrr contributors.
// SPDX-License-Identifier: GPL-2.0-or-later

//go:build linux

package update

import (
	"fmt"
	"os"
	"syscall"
)

func restartCurrentProcess() error {
	executablePath, err := os.Executable()
	if err != nil {
		return fmt.Errorf("locate installed executable: %w", err)
	}

	return syscall.Exec(executablePath, os.Args, os.Environ()) //nolint:gosec // G702: executablePath comes from os.Executable() and was atomically replaced by the verified uploaded binary; re-execing the running binary's own path is the intended restart mechanism
}
