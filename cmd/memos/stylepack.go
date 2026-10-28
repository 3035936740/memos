package main

import (
	"fmt"
	"io"
	"os"

	"github.com/spf13/cobra"

	"github.com/usememos/memos/internal/stylepack"
)

func stylePackCommand() *cobra.Command {
	parent := &cobra.Command{Use: "stylepack", Short: "Inspect community style packs offline"}
	parent.AddCommand(&cobra.Command{Use: "check <file.zip>", Short: "Validate a style pack without starting the server", Args: cobra.ExactArgs(1), RunE: func(cmd *cobra.Command, args []string) error {
		file, err := os.Open(args[0])
		if err != nil {
			return err
		}
		defer file.Close()
		data, err := io.ReadAll(io.LimitReader(file, stylepack.MaxZIPBytes+1))
		if err != nil {
			return err
		}
		pack, err := stylepack.Parse(data)
		if err != nil {
			return err
		}
		_, err = fmt.Fprintf(cmd.OutOrStdout(), "OK %s %v — compiled CSS: %d bytes\n", pack.Manifest.ID, pack.Manifest.Name, len(pack.Compiled))
		return err
	}})
	return parent
}
