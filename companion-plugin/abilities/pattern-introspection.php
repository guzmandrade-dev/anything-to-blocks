<?php
/**
 * Pattern introspection ability — exposes registered block patterns via MCP.
 *
 * @package A2BCompanion
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

/**
 * Register the pattern introspection ability.
 */
function a2b_register_pattern_introspection_ability(): void {
    wp_register_ability(
        'a2b/get-block-patterns',
        array(
            'label'             => __( 'Get Block Patterns', 'a2b-companion' ),
            'description'       => __( 'Retrieve all registered block patterns with their names, titles, categories, and content markup.', 'a2b-companion' ),
            'category'          => 'site',
            'input_schema'      => array(
                'type'       => 'object',
                'properties' => array(
                    'category' => array(
                        'type'        => 'string',
                        'description' => 'Filter patterns by category (e.g. header, footer, gallery, call-to-action). Omit for all.',
                    ),
                ),
            ),
            'output_schema'     => array(
                'type'  => 'array',
                'items' => array(
                    'type'       => 'object',
                    'properties' => array(
                        'name'      => array( 'type' => 'string' ),
                        'title'     => array( 'type' => 'string' ),
                        'category'  => array( 'type' => 'string' ),
                        'content'   => array( 'type' => 'string' ),
                        'keywords'  => array( 'type' => 'array', 'items' => array( 'type' => 'string' ) ),
                    ),
                ),
            ),
            'execute_callback'  => 'a2b_get_block_patterns',
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
 * Execute callback: return all registered block patterns.
 *
 * @param array $input Input arguments.
 * @return array
 */
function a2b_get_block_patterns( array $input ): array {
    $registry    = WP_Block_Patterns_Registry::get_instance();
    $all_patterns = $registry->get_all();
    $category    = $input['category'] ?? '';

    $result = array();
    foreach ( $all_patterns as $pattern ) {
        if ( $category && ( $pattern['categories'][0] ?? '' ) !== $category ) {
            continue;
        }

        $result[] = array(
            'name'     => $pattern['name'] ?? '',
            'title'    => $pattern['title'] ?? '',
            'category' => $pattern['categories'][0] ?? '',
            'content'  => $pattern['content'] ?? '',
            'keywords' => $pattern['keywords'] ?? array(),
        );
    }

    return $result;
}