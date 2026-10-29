#include "lfs.h"
#include <stdarg.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static unsigned char image[65536];

void addLogAdv(int level, int feature, const char *format, ...) {
    (void)level;
    (void)feature;
    va_list arguments;
    va_start(arguments, format);
    vfprintf(stderr, format, arguments);
    va_end(arguments);
    fputc('\n', stderr);
}

static int image_read(const struct lfs_config *config, lfs_block_t block,
        lfs_off_t offset, void *buffer, lfs_size_t size) {
    (void)config;
    if (block >= 16 || offset + size > 4096) return LFS_ERR_INVAL;
    memcpy(buffer, image + block * 4096 + offset, size);
    return 0;
}

static int image_program(const struct lfs_config *config, lfs_block_t block,
        lfs_off_t offset, const void *buffer, lfs_size_t size) {
    (void)config;
    if (block >= 16 || offset + size > 4096) return LFS_ERR_INVAL;
    const unsigned char *source = buffer;
    unsigned char *target = image + block * 4096 + offset;
    for (lfs_size_t index = 0; index < size; index++) {
        if ((target[index] & source[index]) != source[index]) return LFS_ERR_CORRUPT;
        target[index] = source[index];
    }
    return 0;
}

static int image_erase(const struct lfs_config *config, lfs_block_t block) {
    (void)config;
    if (block >= 16) return LFS_ERR_INVAL;
    memset(image + block * 4096, 255, 4096);
    return 0;
}

static int image_sync(const struct lfs_config *config) {
    (void)config;
    return 0;
}

static void require(int condition, const char *message) {
    if (!condition) {
        fprintf(stderr, "%s\n", message);
        exit(1);
    }
}

static int owned_file(const char *name) {
    return !strcmp(name, "grundig.bat") || !strcmp(name, "grundig-persist.bat")
        || !strcmp(name, "grundig-state.bat") || !strcmp(name, "grundig.html.gz");
}

int main(int argc, char **argv) {
    require(argc >= 5 && argc % 2 == 1, "Usage: lfs_image input output name source [name source ...]");
    require(strcmp(argv[1], argv[2]) != 0, "Input backup must not be overwritten");
    FILE *input = fopen(argv[1], "rb");
    require(input != NULL, "Cannot open source image");
    require(fread(image, 1, sizeof(image), input) == sizeof(image), "Image must be 64 KiB");
    require(fgetc(input) == EOF, "Image exceeds 64 KiB");
    fclose(input);

    struct lfs_config config = {0};
    config.read = image_read;
    config.prog = image_program;
    config.erase = image_erase;
    config.sync = image_sync;
    config.read_size = 1;
    config.prog_size = 1;
    config.block_size = 4096;
    config.block_count = 16;
    config.cache_size = 16;
    config.lookahead_size = 16;
    config.block_cycles = 500;
    lfs_t filesystem;
    require(lfs_mount(&filesystem, &config) == 0, "Cannot mount backup; formatting is forbidden");
    for (int argument = 3; argument < argc; argument += 2) {
        require(owned_file(argv[argument]), "Refusing to replace unrelated file");
        int result = lfs_remove(&filesystem, argv[argument]);
        require(result == 0 || result == LFS_ERR_NOENT, "Cannot remove old owned file");
    }
    for (int argument = 3; argument < argc; argument += 2) {
        FILE *source = fopen(argv[argument + 1], "rb");
        require(source != NULL, "Cannot open replacement");
        require(fseek(source, 0, SEEK_END) == 0, "Cannot measure replacement");
        long length = ftell(source);
        require(length > 0 && length < 65536, "Invalid replacement size");
        rewind(source);
        unsigned char *expected = malloc((size_t)length);
        unsigned char *actual = malloc((size_t)length);
        require(expected != NULL && actual != NULL, "Out of memory");
        require(fread(expected, 1, (size_t)length, source) == (size_t)length, "Cannot read replacement");
        fclose(source);
        lfs_file_t file;
        require(lfs_file_open(&filesystem, &file, argv[argument], LFS_O_WRONLY | LFS_O_CREAT | LFS_O_TRUNC) == 0, "Cannot create replacement");
        require(lfs_file_write(&filesystem, &file, expected, (lfs_size_t)length) == length, "Incomplete replacement write");
        require(lfs_file_close(&filesystem, &file) == 0, "Cannot commit replacement");
        require(lfs_file_open(&filesystem, &file, argv[argument], LFS_O_RDONLY) == 0, "Cannot reopen replacement");
        require(lfs_file_size(&filesystem, &file) == length, "Replacement size differs");
        require(lfs_file_read(&filesystem, &file, actual, (lfs_size_t)length) == length, "Incomplete readback");
        require(memcmp(expected, actual, (size_t)length) == 0, "Replacement readback differs");
        require(lfs_file_close(&filesystem, &file) == 0, "Cannot close readback");
        printf("Verified %s: %ld bytes\n", argv[argument], length);
        free(expected);
        free(actual);
    }
    lfs_ssize_t blocks = lfs_fs_size(&filesystem);
    require(blocks > 0 && blocks <= 14, "Insufficient spare blocks for persistence");
    require(lfs_unmount(&filesystem) == 0, "Cannot unmount completed image");
    require(lfs_mount(&filesystem, &config) == 0, "Completed image cannot be remounted");
    require(lfs_unmount(&filesystem) == 0, "Cannot unmount verification image");
    FILE *output = fopen(argv[2], "wb");
    require(output != NULL, "Cannot create output image");
    require(fwrite(image, 1, sizeof(image), output) == sizeof(image), "Incomplete output image");
    require(fclose(output) == 0, "Cannot close output image");
    printf("PASS: unchanged 64 KiB geometry, %ld/16 blocks allocated\n", (long)blocks);
    return 0;
}