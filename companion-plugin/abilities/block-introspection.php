<?php
/**
 * Block introspection ability — exposes registered block types via MCP.
 *
 * @package A2BCompanion
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

/**
 * Register the block introspection ability.
 */
function a2b_register_block_introspection_ability(): void {
    wp_register_ability(
        'a2b/get-block-types',
        array(
            'label'             => __( 'Get Block Types', 'a2b-companion' ),
            'description'       => __( 'Retrieve all registered Gutenberg block types with their names, titles, categories, attributes, and supports flags.', 'a2b-companion' ),
            'category'          => 'site',
            'input_schema'      => array(
                'type'       => 'object',
                'properties' => array(
                    'category' => array(
                        'type'        => 'string',
                        'description' => 'Filter blocks by category (e.g. text, media, design, widgets, theme, embed). Omit for all.',
                    ),
                ),
            ),
            'output_schema'     => array(
                'type'  => 'array',
                'items' => array(
                    'type'       => 'object',
                    'properties' => array(
                        'name'       => array( 'type' => 'string' ),
                        'title'      => array( 'type' => 'string' ),
                        'category'   => array( 'type' => 'string' ),
                        'icon'       => array( 'type' => 'string' ),
                        'attributes' => array( 'type' => 'object' ),
                        'supports'   => array( 'type' => 'object' ),
                    ),
                ),
            ),
            'execute_callback'  => 'a2b_get_block_types',
            'permission_callback' => function () {
                return current_user_can( 'edit_posts' );
            },
            'meta'              => array(
                'public' => true,
            ),
        )
    );
}

/**
 * Execute callback: return all registered block types.
 *
 * @param array $input Input arguments.
 * @return array
 */
function a2b_get_block_types( array $input ): array {
    $registry   = WP_Block_Type_Registry::get_instance();
    $all_blocks = $registry->get_all();
    $category   = $input['category'] ?? '';

    $result = array();
    foreach ( $all_blocks as $name => $block ) {
        if ( $category && isset( $block->category ) && $block->category !== $category ) {
            continue;
        }

        $result[] = array(
            'name'       => $name,
            'title'      => $block->title ?? $name,
            'category'   => $block->category ?? '',
            'icon'       => is_string( $block->icon ) ? $block->icon : '',
            'attributes' => $block->attributes ?? array(),
            'supports'   => $block->supports ?? array(),
        );
    }

    return $result;
}